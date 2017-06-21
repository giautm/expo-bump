"use strict";

const fs = require('fs');
const execSync = require('child_process').execSync;
const semver = require('semver');
const inquirer = require('inquirer');
const shellQuote = require('shell-quote');

const createExpoBump = (remoteName, branchName) => {
  remoteName = remoteName || 'origin';
  branchName = branchName || 'master';

  const UsageError = class extends Error {
    constructor(message) {
      super(message);
      this.name = 'UsageError';
    }
  };

  const run = (command, stdio) => execSync(command, {
    encoding: 'utf8',
    stdio,
  });

  const quote = (string) => shellQuote.quote([string]);
  const getRootPath = () => run('git rev-parse --show-cdup').trim();
  const getJsonPath = (filename) => `${process.cwd()}/${getRootPath()}${filename}`;

  const writePackageJson = (filename, configObject) => fs.writeFileSync(
    getJsonPath(filename), `${JSON.stringify(configObject, null, 2)}\n`);

  return (releaseType = 'patch', options = {}) => {
    const isPrerelease = ['major', 'minor', 'patch'].indexOf(releaseType) === -1;

    const getHashFor = (branchName) => {
      try {
        return run(`git rev-parse --verify ${quote(branchName)}`).trim();
      } catch (error) {
        throw new UsageError(
          `Git couldn't find the branch: "${branchName}"; please ensure it exists`);
      }
    };

    const ensureCleanBranch = () => {
      if (getHashFor('HEAD') !== getHashFor(branchName)) {
        throw new UsageError(
          `You need to be on the "${branchName}" branch to run this script`);
      }
      if (getHashFor(branchName) !== getHashFor(`${remoteName}/${branchName}`)) {
        throw new UsageError('You need to push your changes first');
      }
      if (run('git status -s').length) {
        throw new UsageError(
          'You have uncommited changes! Commit them before running this script');
      }
    };

    const doBump = () => {
      const filename = options.file || 'app.json';
      const jsonContent = require(getJsonPath(filename));
      const expoJson = options.exp ? jsonContent : jsonContent.expo;

      const oldVersion = expoJson.version;
      // Tag a new release
      const newStableVersion = expoJson.version = (isPrerelease
        ? semver.inc(oldVersion, 'pre', releaseType)
        : semver.inc(oldVersion, releaseType));

      if (options.android && expoJson.android) {
        expoJson.android.versionCode++;
      }
      if (options.ios && expoJson.ios) {
        expoJson.ios.buildNumber = newStableVersion;
      }

      writePackageJson(filename, jsonContent);
      if (options.cpy) {
        writePackageJson(options.cpy, jsonContent);
      }
      console.log(`Version bumped from ${oldVersion} to ${newStableVersion}`);

      run(`git add ${quote(getJsonPath(filename))}`);
      run(`git commit -m ${quote(`Tag ${newStableVersion}`)}`);
      run(`git tag ${quote(newStableVersion)}`);

      // Bump to a new pre-release version but only if the version to publish is not
      // itself a pre-release; otherwise semver gets confused.
      if (!isPrerelease) {
        expoJson.version = `${semver.inc(expoJson.version, 'patch')}-pre`;
        writePackageJson(filename, jsonContent);

        run(`git add ${quote(getJsonPath(filename))}`);
        run(`git commit -m ${quote(`Bump to ${expoJson.version}`)}`);
      }

      const revertChanges = () => {
        run(`git tag -d ${quote(newStableVersion)}`);
        run(`git reset --hard ${quote(remoteName)}/${quote(branchName)}`);
        console.log('Changes reverted');
      };

      const publishAnswersPromise = options.publish
        ? Promise.resolve({ shouldProceed: true })
        : inquirer.prompt([{
            name: 'shouldProceed',
            type: 'confirm',
            message: 'Do you want to publish the new version to Expo?',
          }]);

      publishAnswersPromise.then((answers) => {
        if (answers.shouldProceed) {
          writePackageJson(options.exp ? 'exp.json' : 'app.json', jsonContent);
          // Push & publish the tag.
          run(`git checkout ${quote(newStableVersion)} 2>/dev/null`);
          run(`exp publish`, [
            process.stdin,
            process.stdout,
            process.stderr,
          ]);
          // run(`npm publish ${quote(getRootPath())}${
          //   isPrerelease ? ` --tag ${quote(releaseType)}` : '' }`);
          run(`git push ${quote(remoteName)} ${quote(newStableVersion)}`);

          // Push the latest commit.
          run(`git checkout ${quote(branchName)} 2>/dev/null`);

          if (!isPrerelease) {
            // Force-update the date to prevent two commits having
            // the same time stamp.
            const commitMsg = run('git show -s --format=%s');
            run('git reset --soft HEAD^');
            run(`git commit -m ${quote(commitMsg)}`);
          }

          run(`git push ${quote(remoteName)} ${quote(branchName)}`);
        } else {
          revertChanges();
        }
      }).catch((err) => {
        console.error('error:', err);
        process.exitCode = 1;
        revertChanges();
      });
    };

    ensureCleanBranch();
    doBump();
  };
};

module.exports = createExpoBump('origin', 'master');
module.exports.custom = createExpoBump;
