#!/usr/bin/env node

'use strict';
const meow = require('meow');

try {
  const cli = meow(`
    Usage
      $ expo-bump <releaseType>
    Options
      --file              Input filename, default: app.json
      --exp               Input is exp.json, default: false
      --android           Increment Android's version code
      --ios               Update iOS's buildNumber equal to new version
      --publish           Publish an Expo update without ask
      --cpy [<file.json>] Copy bumped file to new name.
    <releaseType>  major | minor | patch | premajor | preminor | prepatch | prerelease
    Examples
      Bump a version of app.json
      $ expo-bump minor app.staging.json --android --out app.json
  `, {
    string: ['_']
  });

  const bump = require('../lib/cli');
  bump(cli.input[0], cli.flags);
} catch (error) {
  if (error.name === 'UsageError') {
    console.error(error.message);
  } else {
    throw error;
  }
}


