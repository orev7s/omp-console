const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const protocolRoot = path.resolve(workspaceRoot, 'packages/protocol');

/**
 * The shared @omp-console/protocol package lives outside this app, so Metro
 * needs to watch it and resolve it explicitly. It is consumed from its built
 * dist output (plain JS), so build it first with `npm run build:protocol`.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [protocolRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    extraNodeModules: {
      '@omp-console/protocol': protocolRoot,
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
