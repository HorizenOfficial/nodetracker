const fs = require('fs');

let oshome = require('os').homedir();

oshome = process.env.ZEN_HOME || oshome;

/* ****** get zen.conf settings ****** */

exports.getZenConfig = () => {
  console.log('Retrieving zen rpc config....');
  let lines;
  try {
    const path1 = `${oshome}/.zen/zen.conf`;
    const path2 = `${oshome}/zencash/.zen/zen.conf`;
    const path3 = `${oshome}/AppData/Roaming/Zen/zen.conf`;

    if (process.env.ZENCONF) {
      lines = fs.readFileSync(process.env.ZENCONF, 'utf8').split('\n');
    } else if (fs.existsSync(path1)) {
      lines = fs.readFileSync(path1, 'utf8').split('\n');
    } else if (fs.existsSync(path2)) {
      lines = fs.readFileSync(path2, 'utf8').split('\n');
    } else if (fs.existsSync(path3)) {
      lines = fs.readFileSync(path3, 'utf8').split('\n');
    }
  } catch (e) {
    console.log('ERROR finding or reading zen.conf file. Make sure the zen secure node is set up properly.');
    process.exit();
  }

  const zencfg = {};
  lines.pop();
  let testnet = false;
  let found4 = false;
  let found6 = false;

  lines.forEach((lineraw) => {
    const line = lineraw.trim();
    if (!line.startsWith('#') && line.indexOf('rpc') === 0) {
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
          zencfg.zip4 = data[1];
          found4 = true;
        }
        if (whichip === '6' && !found6) {
          zencfg.zip6 = data[1];
          found6 = true;
        }
      }
      if (data[0] === 'port') zencfg.port = data[1];
    }
  });

  zencfg.rpchost = zencfg.rpcallowip || zencfg.rpcbind || 'localhost';
  zencfg.testnet = testnet;
  // build url
  const port = zencfg.rpcport;
  const url = `http://${zencfg.rpchost}:${port}`;
  zencfg.url = url;

  if (!zencfg.zip4 && !zencfg.zip6) {
    console.log('External IP address (externalip=) not found in zen.conf. At least one (IPv4 or IPv6) required for secure nodes. Both IPv4 and IPv6 required for super nodes.');
    console.log('If multiple, add the externalip= for each address on a separate line.');
    process.exit();
  }
  if (!zencfg.port) {
    console.log('Port not found in zen.conf. Add \'port=9033\' for mainnet or \'port=19033\' for testnet');
    process.exit();
  }
console.log(zencfg)
  return zencfg;
};
