const fs = require('fs');

let oshome = require('os').homedir();

oshome = process.env.ZEN_HOME || oshome;

/* ****** get zen.conf settings ****** */

exports.getZenConfig = () => {
  console.log('Retrieving zen rpc config....');
  let lines = [];
  try {
    const paths = [
      process.env.ZENCONF,
      `${oshome}/.zen/zen.conf`,
      `${oshome}/zencash/.zen/zen.conf`,
      `${oshome}/AppData/Roaming/Zen/zen.conf`,
    ];

    paths.some((path) => {
      if (path && fs.existsSync(path)) {
        lines = fs.readFileSync(path, 'utf8').split('\n');
      }

      return lines.length > 0; // exits early if we found the config file
    });
  } catch (e) {
    console.log('ERROR finding or reading zen.conf file. Make sure the zen secure node is set up properly.');
    process.exit();
  }

  lines.pop();

  const zencfg = {};
  let testnet = false;
  let found4 = false;
  let found6 = false;
  let foundMax = false;

  lines.forEach((lineraw) => {
    const line = lineraw.trim();
    if (!line.startsWith('#')) {
      if (line.indexOf('rpc') === 0) {
        const idx = line.indexOf('='); // don't use split since user or pw could have =
        const key = line.substring(0, idx);
        const val = line.substring(idx + 1);
        zencfg[key] = val.trim();
      } else {
        if (line === 'testnet=1') testnet = true;
        const data = line.split('=');
        if (data[0] === 'externalip') {
          const whichip = line.indexOf(':') !== -1 ? '6' : '4';
          // track if found in case of multiple.  use first.
          if (whichip === '4' && !found4) {
            /* eslint-disable-next-line prefer-destructuring */
            zencfg.zip4 = data[1];
            found4 = true;
          }
          if (whichip === '6' && !found6) {
            /* eslint-disable-next-line prefer-destructuring */
            zencfg.zip6 = data[1];
            found6 = true;
          }
        }
        /* eslint-disable-next-line prefer-destructuring */
        if (data[0] === 'port') zencfg.port = data[1];
        if (data[0] === 'maxconnections') foundMax = true;
      }
    }
  });

  zencfg.rpchost = zencfg.rpcallowip || zencfg.rpcbind || 'localhost';
  zencfg.testnet = testnet;
  if (!zencfg.rpcport) {
    zencfg.rpcport = testnet ? '18231' : '8231';
  }

  // build url
  zencfg.url = `http://${zencfg.rpchost}:${zencfg.rpcport}`;

  if (foundMax) {
    console.log('Found maxconnections in zen.conf.  Please remove.');
    process.exit();
  }
  if (!zencfg.zip4 && !zencfg.zip6) {
    console.log('External IP address (externalip=) not found in zen.conf. At least one (IPv4 or IPv6) required for '
      + 'secure nodes. Both IPv4 and IPv6 required for super nodes.');
    console.log('If multiple, add the externalip= for each address on a separate line.');
    process.exit();
  }
  if (!zencfg.port) {
    console.log('Port not found in zen.conf. Add \'port=9033\' for mainnet or \'port=19033\' for testnet');
    process.exit();
  }

  return zencfg;
};
