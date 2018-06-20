const promptly = require('promptly');
const fs = require('fs');
const init = require('./init');
const http = require('https');
const { LocalStorage } = require('node-localstorage');

const localStorage = new LocalStorage('./config');

let oshome = require('os').homedir();

oshome = process.env.ZEN_HOME || oshome;

// get existing values if this is setup rerun
// trim in case someone enters a value by editing file
const addrLS = localStorage.getItem('stakeaddr');
const emailLS = localStorage.getItem('email');
const fqdnLS = localStorage.getItem('fqdn');
const regionLS = localStorage.getItem('region');
const ipvLS = localStorage.getItem('ipv');
const nodetypeLS = localStorage.getItem('nodetype');
const addr = addrLS ? addrLS.trim() : null;
const email = emailLS ? emailLS.trim() : null;
const fqdn = fqdnLS ? fqdnLS.trim() : null;
const regionCurrent = regionLS ? regionLS.trim() : null;
const ipv = ipvLS ? ipvLS.trim() : '4';
const nodetype = nodetypeLS ? nodetypeLS.trim() : null;
const regions = [];

const getSetupInfo = (serverurl, cb) => {
  console.log('Retrieving server list from region....');
  http.get(serverurl, (res) => {
    const { statusCode } = res;
    const contentType = res.headers['content-type'];

    let error;
    if (statusCode === 301 || statusCode === 302) {
      console.log('Retrieving server list from region.... redirecting');
      return getSetupInfo(res.headers.location, cb);
    }
    if (statusCode !== 200) {
      error = new Error('Request Failed.\n' +
        `Status Code: ${statusCode}`);
    } else if (!/^application\/json/.test(contentType)) {
      error = new Error('Invalid content-type.\n' +
        `Expected application/json but received ${contentType}`);
    }
    if (error) {
      console.log('Unable to connect to server for setup data.');
      // consume response data to free up memory
      res.resume();
      return cb(error.message);
    }

    res.setEncoding('utf8');
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        const data = JSON.parse(rawData);
        //  console.log(parsedData);
        let regPrompt = '';
        data.regions.forEach((r) => {
          regPrompt += `${r[1]}(${r[0]}) `;
          regions.push(r[0]);
        });
        const { servers } = data;
        const serverInfo = {
          regionServer: data.region,
          servers,
          regList: data.regions,
          regPrompt,
          regions,
        };
        localStorage.setItem('servers', servers);
        return cb(null, serverInfo);
      } catch (e) {
        console.error(e.message);
        return cb(e.message);
      }
    });
    return null;
  }).on('error', (e) => {
    console.error(`Error: ${e.message}`);
    console.error('Can not complete setup.');
    process.exit();
  });
};

const addrValidator = (value) => {
  if (value.length !== 35) {
    throw new Error('That does not appear to be a transparent address.');
  }
  return value;
};

const ipValidator = (value) => {
  if (value === '4') {
    return value;
  }
  if (value === '6') {
    return value;
  }
  throw new Error('The ip address version must be either 4 or 6.');
};

const regValidator = (value) => {
  const found = regions.find(reg => reg === value);
  if (found) {
    return value;
  }
  throw new Error('Enter one of the region codes shown in (xxx)');
};

const typeValidator = (value) => {
  if (value === 'secure' || value === 'super') {
    return value;
  }
  throw new Error('Enter secure or super');
};

const setRegAndServer = (reg, servers) => {
  localStorage.setItem('region', reg);
  let found = false;
  for (let i = 0; i < servers.length; i += 1) {
    const srv = servers[i].split('.');
    if (srv[1] === reg) {
      localStorage.setItem('home', servers[i]);
      found = true;
      break;
    }
  }
  if (!found) {
    console.error('ERROR SETTING THE HOME SERVER. Please try running setup again or report the issue if it persists.');
  } else {
    console.log('***Setup complete!***');
  }
};

// get zen rpc config
const getRPC = (cb) => {
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

  lines.pop();
  let testnet = false;
  let ipfound = false;
  lines.forEach((lineraw) => {
    const line = lineraw.trim();
    if (!line.startsWith('#') && line.indexOf('rpc') === 0) {
      const idx = line.indexOf('='); // don't use split since user or pw could have =
      const key = line.substring(0, idx);
      const val = line.substring(idx + 1);
      if (key === 'rpcallowip') {
        ipfound = true;
        localStorage.setItem('rpchost', val);
      } else {
        localStorage.setItem(key, val);
      }
    }
    if (line === 'testnet=1') testnet = true;
  });

  if (!ipfound) localStorage.setItem('rpchost', 'localhost');

  cb(testnet);
};

const promptUser = (serverInfo) => {
  const region = regionCurrent || serverInfo.regionServer;
  const msg1 = addr ? ` (Existing: ${addr}):` : ':';
  const msg2 = email ? ` (Existing: ${email}):` : ':';
  const msg3 = fqdn ? ` (Existing: ${fqdn}):` : ':';
  const msg4 = ipv ? ` (Existing: ${ipv}):` : ':';
  const msg5 = region ? ` (Default: ${region}):` : ':';

  // Prompt user for values
  promptly
    .prompt(`Staking transparent address ${msg1}`, { default: addr, addrValidator })
    .then((stake) => {
      localStorage.setItem('stakeaddr', stake);
      return promptly.prompt(`Alert email address ${msg2}`, { default: email });
    })
    .then((em) => {
      localStorage.setItem('email', em.toLowerCase());
      return promptly.prompt(`Full hostname (FQDN) used in cert. example: z1.mydomain.com ${msg3}`, { default: fqdn });
    })
    .then((hostname) => {
      localStorage.setItem('fqdn', hostname);
      return promptly.prompt(`IP address version used for connection - 4 or 6 ${msg4}`, { default: ipv, validator: ipValidator });
    })
    .then((ipType) => {
      localStorage.setItem('ipv', ipType);
      return promptly.choose(`Region code - ${serverInfo.regPrompt} ${msg5}`, regions, { default: region, validator: regValidator });
    })
    .then((reg) => {
      setRegAndServer(reg, serverInfo.servers);
    })
    .catch((error) => {
      console.error('ERROR: ', error.message);
    });
};
// start setup
console.log('Welcome to nodetracker setup for secure and super nodes.');
console.log('Enter the value for each prompt and press the \'Enter\' key.');
console.log('Press the \'Enter\' key for defaults or existing selections');
console.log('-----------------------------------------------------------');
getRPC((isTestnet) => {
  if (isTestnet) {
    console.log('Zen is running on testnet');
    console.log('To run on mainnet please reconfigure zen.conf and remove or comment \'#testnet=1\'');
    console.log('Continuing testnet setup');
    getSetupInfo(init.server.testnet, (err, serverInfo) => {
      if (err) {
        console.error('Can not complete setup.', err);
        process.exit();
      }
      promptUser(serverInfo);
    });
  } else {
    const msg1 = nodetype ? ` (Existing: ${nodetype}):` : ':';
    promptly
      .choose(`Enter the node type - secure or super ${msg1}`, ['secure', 'super'], { default: nodetype, validator: typeValidator })
      .then((ntype) => {
        localStorage.setItem('nodetype', ntype);
        getSetupInfo(init.servers[ntype], (err, serverInfo) => {
          if (err) {
            console.error('Can not complete setup.', err);
            process.exit();
          }
          promptUser(serverInfo);
        });
      })
      .catch((error) => {
        console.error('ERROR: ', error.message);
      });
  }
});
