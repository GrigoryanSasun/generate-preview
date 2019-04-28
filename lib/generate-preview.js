const tempy = require('tempy')
const child_process = require('child_process')
const gitP = require('simple-git/promise')
const tar = require('tar')
const del = require('del')
const GitUrlParse = require('git-url-parse')

const moduleDir = process.cwd()
const packageJson = require(moduleDir + '/package.json')

const tmpDir = tempy.directory()
const tmpPackageDir = `${tmpDir}/package`
const moduleGit = gitP(moduleDir)

module.exports = function({remoteName}) {
    Promise.all([
        moduleGit.revparse(['--abbrev-ref', 'HEAD']).then(res => res.trim() + '-dist'),
        moduleGit.raw(['remote', 'get-url', remoteName]).then(res => GitUrlParse(res.trim()).toString('ssh')),
        new Promise((resolve, reject) =>
            child_process.exec(`npm pack | tail -1`, {cwd: moduleDir}, function(err, stdout) {
                if (err) {
                    reject(err)
                } else {
                    resolve(stdout.trim())
                }
            })
        )
    ])
        .then(([distBranchName, REMOTE_URL, packedFilename]) =>
            tar
                .x({
                    file: packedFilename,
                    cwd: tmpDir
                })
                .then(() => gitP(tmpPackageDir))
                .then(git =>
                    git
                        .init()
                        .then(() => git.checkoutLocalBranch(distBranchName))
                        .then(() => git.add(['.']))
                        .then(() => git.commit('bundle update'))
                        .then(() => git.addRemote(remoteName, REMOTE_URL))
                        .then(() => git.push(['--force', remoteName, distBranchName]))
                )
                .then(() => {
                    console.log(
                        `Copy the URL and paste it as version number in your package.json for ${packageJson.name}`
                    )
                    console.log(`git+ssh://${REMOTE_URL}#${distBranchName}`)
                    return [tmpDir, packedFilename]
                })
                .catch(err => {
                    del.sync([tmpDir, packedFilename], {force: true})
                    throw err
                })
        )
        .then(dirs => del(dirs, {force: true}))
        .catch(err => {
            console.error(err)
            process.exit(1)
        })
}
