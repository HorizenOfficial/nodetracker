const jsonfile = require('jsonfile');
const promptly = require('promptly');
const http = require('https');
const { LocalStorage } = require('node-localstorage');

const localStorage = new LocalStorage('./config');
const Zen = require('./zencfg');
const init = require('./init');

const file = './config/config.json';
const newcfg = {};

const convertConfig = () => {
  // get existing values if this is setup migration
  // trim in case someone enters a value by editing file
  const stakeaddrLS = localStorage.getItem('stakeaddr');
  const emailLS = localStorage.getItem('email');
  const fqdnLS = localStorage.getItem('fqdn');
  const regionLS = localStorage.getItem('region');
  const ipvLS = localStorage.getItem('ipv');
  const catLS = localStorage.getItem('category');

  const cfgOld = {};
  cfgOld.nodeid = localStorage.getItem('nodeid');
  cfgOld.stakeaddr = stakeaddrLS ? stakeaddrLS.trim() : null;
  cfgOld.email = emailLS ? emailLS.trim() : null;
  cfgOld.fqdn = fqdnLS ? fqdnLS.trim() : null;
  cfgOld.region = regionLS ? regionLS.trim() : null;
  cfgOld.ipv = ipvLS ? ipvLS.trim() : '4';
  cfgOld.category = catLS ? catLS.trim() : null;
  if (cfgOld.stakeaddr) cfgOld.replace = true;
  return { cfgOld };
};

const getconfig = (cb) => {
  jsonfile.readFile(file, (err, config) => {
    if (err) {
      // check for previous version individual files
      return cb(convertConfig());
    }
    return cb(config);
  });
};

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
      error = new Error(`Request Failed.\nStatus Code: ${statusCode}`);
    } else if (!/^application\/json/.test(contentType)) {
      error = new Error(`Invalid content-type.\nExpected application/json but received ${contentType}`);
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
        newcfg.servers = servers;
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
  return value.trim();
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

const catValidator = (value) => {
  if (!value) {
    throw new Error('Enter \'none\' to skip');
  }
  return value;
};

const setHomeServer = (reg, servers) => {
  let found = false;
  const idx = newcfg.nodetype === 'testnet' ? 2 : 1;
  for (let i = 0; i < servers.length; i += 1) {
    const srv = servers[i].split('.');
    if (srv[idx] === reg) {
      // localStorage.setItem('home', servers[i]);
      newcfg.home = servers[i];
      found = true;
      break;
    }
  }
  if (!found) {
    console.error('ERROR SETTING THE HOME SERVER. Please try running setup again or report the issue if it persists.');
    return 'error';
  }
  return 'ok';
};

const saveConfig = (cfg, cfgAll) => {
  const config = Object.assign({}, cfgAll);
  if (cfgAll.cfgOld) {
    // collected from separate files. remove old fi
    localStorage.clear();
    delete config.cfgOld;
  }
  config.active = newcfg.nodetype;
  config[newcfg.nodetype] = newcfg;
  jsonfile.writeFile(file, config, { spaces: 1 }, (err) => {
    if (err) {
      console.error(err);
      return ('failed');
    }
    return 'ok';
  });
};

const promptUser = (cfg, cfgAll, serverInfo) => {
  const region = cfg.region || serverInfo.regionServer;
  const msg1 = cfg.stakeaddr ? ` (Existing: ${cfg.stakeaddr}):` : ':';
  const msg2 = cfg.email ? ` (Existing: ${cfg.email}):` : ':';
  const msg3 = cfg.fqdn ? ` (Existing: ${cfg.fqdn}):` : ':';
  const msg4 = cfg.ipv ? ` (Existing: ${cfg.ipv}):` : ':';
  const msg5 = region ? ` (Default: ${region}):` : ':';


  console.log(`Configure for ${newcfg.nodetype} node`);

  // Prompt user for values
  promptly
    .prompt(`Staking transparent address ${msg1}`, { default: cfg.stakeaddr, validator: addrValidator })
    .then((stake) => {
      newcfg.stakeaddr = stake;
      return promptly.prompt(`Alert email address ${msg2}`, { default: cfg.email });
    })
    .then((em) => {
      newcfg.email = em.toLowerCase().trim();
      return promptly.prompt(
        `Full hostname (FQDN) used in cert. example: z1.mydomain.com ${msg3}`,
        { default: cfg.fqdn },
      );
    })
    .then((hostname) => {
      newcfg.fqdn = hostname.trim();
      return promptly.prompt(
        `IP address version used for connection - 4 or 6 ${msg4}`,
        { default: cfg.ipv, validator: ipValidator },
      );
    })
    .then((ipType) => {
      newcfg.ipv = ipType;
      return promptly.choose(
        `Region - ${serverInfo.regPrompt} ${msg5}`,
        regions,
        { default: region, validator: regValidator },
      );
    })
    .then((reg) => {
      newcfg.region = reg;
      return setHomeServer(reg, serverInfo.servers);
    })
    .then((regok) => {
      if (regok === 'error') process.exit();
      console.log(' ');
      console.log('A category may be used to uniquely identify a set of nodes.');
      const options = { validator: catValidator, retry: false };
      let msg6 = ':';
      if (!cfg.category || (cfg.category && cfg.category === 'none')) {
        msg6 = ' (Default: none):';
        options.default = 'none';
      } else {
        console.log('Enter \'none\' if you do not want to use a category');
        msg6 = ` ( Existing: ${cfg.category}):`;
        options.default = cfg.category;
      }
      return promptly.prompt(`Optional node category - alphanumeric. ${msg6}`, options);
    })
    .then((cat) => {
      newcfg.category = cat;
      return saveConfig(cfg, cfgAll);
    })
    .then((msg) => {
      if (msg === 'failed') {
        console.log('-----Unable to save the configuration.  Setup did not complete.-----');
      } else {
        console.log(`***Configuration for ${newcfg.nodetype} node saved. Setup complete!***`);
      }
    })
    .catch((error) => {
      console.error('ERROR: ', error.message);
    });
};

// start setup
console.log('Nodetracker setup for secure and super nodes.');
console.log('Enter the value for each prompt and press the \'Enter\' key.');
console.log('Press the \'Enter\' key for defaults or existing selections');
console.log('-----------------------------------------------------------');

const zencfg = Zen.getZenConfig();
console.log(zencfg);

if (zencfg.testnet) {
  console.log('Zen is running on testnet');
  console.log('To run on mainnet please reconfigure zen.conf and remove or comment \'#testnet=1\'');
  console.log('Continuing testnet setup');
  getSetupInfo(init.servers.testnet, (err, serverInfo) => {
    if (err) {
      console.error('Can not complete setup.', err);
      process.exit();
    }
    newcfg.nodetype = 'testnet';
    getconfig((cfgAll) => {
      let cfg = {};
      if (cfgAll.cfgOld) {
        newcfg.nodeid = cfgAll.cfgOld.nodeid;
        cfg = cfgAll.cfgOld;
      } else if (cfgAll.testnet) {
        cfg = cfgAll.testnet;
        if (cfg.nodeid) newcfg.nodeid = cfg.nodeid;
      }
      promptUser(cfg, cfgAll, serverInfo);
    });
  });
} else {
  getconfig((cfgAll) => {
    const msg1 = cfgAll.active && cfgAll.active !== 'testnet' ? ` (Existing: ${cfgAll.active}):` : ':';
    promptly
      .choose(
        `Enter the node type - secure or super ${msg1}`,
        ['secure', 'super'],
        { default: cfgAll.active, validator: typeValidator },
      )
      .then((ntype) => {
        newcfg.nodetype = ntype;
        let cfg = {};
        if (cfgAll.cfgOld) {
          newcfg.nodeid = cfgAll.cfgOld.nodeid;
          cfg = cfgAll.cfgOld;
        } else if (cfgAll.active === ntype) {
          cfg = cfgAll[ntype];
          if (cfg.nodeid) newcfg.nodeid = cfg.nodeid;
        }
        getSetupInfo(init.servers[ntype], (err, serverInfo) => {
          if (err) {
            console.error('Can not complete setup.', err);
            process.exit();
          }
          promptUser(cfg, cfgAll, serverInfo);
        });
      })
      .catch((error) => {
        console.error('ERROR: ', error.message);
      });
  });
}
// });
