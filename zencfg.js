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

  lines.forEach((lineraw) => {
    const line = lineraw.trim();
    if (!line.startsWith('#') && line.indexOf('rpc') === 0) {
      const idx = line.indexOf('='); // don't use split since user or pw could have =
      const key = line.substring(0, idx);
      const val = line.substring(idx + 1);
      zencfg[key] = val.trim();
    }
    if (line === 'testnet=1') testnet = true;
  });

  zencfg.rpchost = zencfg.rpcallowip || zencfg.rpcbind || 'localhost';
  zencfg.testnet = testnet;
  // build url
  const port = zencfg.rpcport || 8231;
  if (zencfg.testnet && !zencfg.rpcport)
    port = 18231;
  
  const url = `http://${zencfg.rpchost}:${port}`;
  zencfg.url = url;

  return zencfg;
};
