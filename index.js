const core = require('@actions/core');
const exec = require('@actions/exec').exec;
const fs = require('fs');
const path = require('path');

function ensureDirExists(path) {
    try {
        fs.mkdirSync(path);
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }
}

function ensureDirIsRemoved(path) {
    try {
        fs.rmdirSync(path, { recursive: true, force: true });
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }
    }
}

function ensureFileIsRemoved(path) {
    try {
        fs.unlinkSync(path);
        console.log(`path was removed: ${path}`);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }
        console.log(`path did not exist: ${path}`);
    }
}

async function downloadSplitsh(splitshPath, splitshVersion) {
    let splitshDir = path.dirname(splitshPath);
    ensureDirExists(splitshDir);
    ensureFileIsRemoved(splitshPath);
    ensureDirIsRemoved('/tmp/splitsh-download/');
    fs.mkdirSync('/tmp/splitsh-download/');
    let downloadDir = '/tmp/splitsh-download/';
    let downloadPath = `${downloadDir}split-lite.tar.gz`;
    let platform = process.platform === 'darwin' ? 'lite_darwin_amd64' : 'lite_linux_amd64';
    console.log(`downloading variant ${platform}`);
    let url = `https://github.com/splitsh/lite/releases/download/${splitshVersion}/${platform}.tar.gz`;
    await exec(`wget -O ${downloadPath} ${url}`);
    await exec(`tar -zxpf ${downloadPath} --directory ${downloadDir}`);
    await exec(`chmod +x ${downloadDir}splitsh-lite`);
    await exec(`mv ${downloadDir}splitsh-lite ${splitshPath}`);
    ensureDirIsRemoved(downloadDir);
}

async function ensureRemoteExists(name, target) {
    try {
        await exec('git', ['remote', 'add', name, target]);
    } catch (e) {
        if ( ! e.message.match(/failed with exit code 3$/g)) {
            throw e;
        }
    }
}

async function publishSubSplit(binary, origin, target, branch, name, directory) {
    let hash = '';
    await exec(binary, [`--prefix=${directory}`, `--origin=${origin}/${branch}`], {
        listeners: {
            stdout: (data) => {
                hash += data.toString();
            }
        }
    });
    await exec('git', ['push', target, `${hash.trim()}:refs/heads/${branch}`, '-f']);
}

(async () => {
    const configPath = core.getInput('config-path');
    const splitshPath = path.resolve(process.cwd(), core.getInput('splitsh-path'));
    const splitshVersion = core.getInput('splitsh-version');
    const origin = core.getInput('origin-remote');
    const branch = core.getInput('source-branch');

    console.log('checking if file exists' + splitshPath);
    if ( ! fs.existsSync(splitshPath)) {
        console.log('file does not exist');
        await downloadSplitsh(splitshPath, splitshVersion);
    }

    let configOptions = JSON.parse(fs.readFileSync(configPath));
    let subSplits = configOptions['sub-splits'];
    console.log(subSplits);

    await Promise.all(subSplits.map(async (split) => {
        await ensureRemoteExists(split.name, split.target);
        await publishSubSplit(splitshPath, origin, split.name, branch, split.name, split.directory);
    }));
})().catch(error => {
    console.log('Something went wrong...');
    core.setFailed(error.message);
});
