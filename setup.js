const promptly = require('promptly');
const fs = require("fs");
const oshome = require('os').homedir();
const LocalStorage = require('node-localstorage').LocalStorage;
const localStorage = new LocalStorage('./config');
const init = require('./init');

const http = require('https');

let servers;
let regList;
let regions = [];
let regPrompt = '';
let regionServer;
let url = init.lookupServer;
const getSetupInfo = (url, cb) => {
    http.get(url, (res) => {
        const { statusCode } = res;
        const contentType = res.headers['content-type'];

        let error;
        if (statusCode === 301 || statusCode === 302) {
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
            console.log('Unable to connect to server for setup data.')
            // consume response data to free up memory
            res.resume();
            cb(error.message);
            return;
        }

        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
            try {
                const data = JSON.parse(rawData);
                //  console.log(parsedData);
                regionServer = data.region;
                servers = data.servers;
                regList = data.regions;
                regList.forEach((r) => {
                    regPrompt += `${r[1]}(${r[0]}) `;
                    regions.push(r[0]);
                });
                localStorage.setItem('servers', servers);
                cb(null, 'done');
            } catch (e) {
                console.error(e.message);
                cb(e.message)
            }
        });
    }).on('error', (e) => {
        console.error(`Got error: ${e.message}`);
        console.error('Can not complete setup.')
        process.exit();
    });
}

const validator = (value) => {
    if (value.length !== 35) {
        throw new Error('That does not appear to be a t_address.');
    }

    return value;
};
//IP type validator
const ipvalidator = (value) => {
    if (value == 4) {
        return value;
    }
    if (value == 6) {
        return value;
    }
    else {
        throw new Error('The ip address version must be either 4 or 6.');
    }
};

const regvalidator = (value) => {
    let found = false;
    for (let i = 0; i < regions.length; i++) {
        if (value == regions[i]) {
            found = true;
            break
        }
    }
    if (found) {
        return value
    } else {
        throw new Error('Enter one of the region codes shown in (xxx)');
    }
}


//get values if setup rerun
let addr = localStorage.getItem('stakeaddr') || null;
let email = localStorage.getItem('email') || null;
let fqdn = localStorage.getItem('fqdn') || null;
let ipv = localStorage.getItem('ipv') || 4;

getSetupInfo(url, (err, result) => {
    if (err) {
        console.error('Can not complete setup.', err)
        process.exit();
    }

    let region = localStorage.getItem('region') || regionServer;

    let msg1 = addr ? ' (Existing: ' + addr + '):' : ':';
    let msg2 = email ? ' (Existing: ' + email + '):' : ':';
    let msg3 = fqdn ? ' (Existing: ' + fqdn + '):' : ':';
    let msg4 = ipv ? ' (Existing: ' + ipv + '):' : ':';
    let msg5 = region ? ' (Default: ' + region + '):' : ':';

    //Prompt user for values 
    promptly
        .prompt('Staking transparent address' + msg1, { 'default': addr, 'validator': validator })
        .then((value) => {
            localStorage.setItem('stakeaddr', value);
            return promptly.prompt('Alert email address' + msg2, { 'default': email });
        })
        .then((value) => {
            localStorage.setItem('email', value);
            return promptly.prompt('Full hostname (FQDN) used in cert. example: z1.mydomain.com ' + msg3, { 'default': fqdn });
        })
        .then((value) => {
            localStorage.setItem('fqdn', value);
            return promptly.prompt('IP address version used for connection - 4 or 6' + msg4, { 'default': ipv, 'validator': ipvalidator });
        })
        .then((value) => {
            localStorage.setItem('ipv', value);
            return promptly.choose('Region code - ' + regPrompt + msg5, regions, { 'default': region, 'validator': regvalidator });
        })
        .then((value) => {
            setRegAndServer(value);
            getRPC();
        })
        .catch((err) => {
            console.error('ERROR: ', err.message);
        });
});

const setRegAndServer = (region) => {
    localStorage.setItem('region', region);
    let found = false;
    for (let i = 0; i < servers.length; i++) {
        let srv = servers[i].split('.');
        if (srv[1] == region) {
            localStorage.setItem('home', servers[i]);
            found = true
            break;
        }
    }
    if (!found) console.error("ERROR SETTING THE HOME SERVER. Please try running setup again or report the issue if it persists.");
}

//get zen rpc config
const getRPC = () => {
    console.log("Retrieving zen rpc config....");

    let lines;
    try {

        let path1 = oshome + "/.zen/zen.conf";
        let path2 = oshome + "/zencash/.zen/zen.conf";
        let path3 = oshome + "/AppData/Roaming/Zen/zen.conf";

        if (process.env.ZENCONF) {
            lines = fs.readFileSync(process.env.ZENCONF, "utf8").split("\n");
        } else if (fs.existsSync(path1)) {
            lines = fs.readFileSync(path1, "utf8").split("\n");
        } else if (fs.existsSync(path2)) {
            lines = fs.readFileSync(path2, "utf8").split("\n");
        } else if (fs.existsSync(path3)) {
            lines = fs.readFileSync(path3, "utf8").split("\n");
        }

        //console.log(path);
    }
    catch (e) {
        console.log("ERROR finding or reading zen.conf file. Make sure the zen secure node is set up properly.");
        process.exit();
    }

    lines.pop();

    let config = {};
    let testnet = false;
    let ipfound = false;
    lines.forEach(line => {
        line = line.trim();
        if (line.indexOf('#') === -1 && line.indexOf("rpc") === 0) {
            let idx = line.indexOf("=");  //don't use split since user or pw could have =
            let key = line.substring(0, idx);
            let val = line.substring(idx + 1);
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

    if (!testnet)
        return console.log("This version should only be run on testnet.  Please reconfigure zen.conf with testnet=1");

    console.log("Setup Complete");

}


