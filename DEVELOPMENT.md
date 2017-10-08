This document will help you get a high level understanding of the PCS deployment CLI (pcs-cli) from a developer's perspective to allow you to either contribute to the pcs-cli project or use it for your own purposes.

pcs-cli is essentially a TypeScript project (it's structure should look very familiar to those that had dabbled with TypeScript projects before). Development dependencies are all resolved via `npm`, so obviously you'll need to have a TypeScript and Node.js development environment setup.

Once that is in place, have a look at `scripts` within `package.json` to look through the convenience  scripts already in place that you can use via npm. The entrypoint to start development should now be obvious to you.
