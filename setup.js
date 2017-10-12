const promptly = require('promptly');
const fs = require("fs");
const oshome = require('os').homedir();
const LocalStorage = require('node-localstorage').LocalStorage;
const localStorage = new LocalStorage('./config');


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
        throw new Error('The ip address format must be either 4 or 6.');
    }
};

//get values if setup rerun
let addr = localStorage.getItem('stakeaddr') || null;
let email = localStorage.getItem('email') || null;
let fqdn = localStorage.getItem('fqdn') || null;
let ipv = localStorage.getItem('ipv') || 4;
//let urlDefault = 'https://tracksys.zensystem.io';
let urlDefault = 'http://devtracksys.secnodes.com';

let msg1 = addr ? ' (Default: ' + addr + '):' : ':';
let msg2 = email ? '(Default: ' + email + '):' : ':';
let msg3 = fqdn ? '(Default: ' + fqdn + '):' : ':';
let msg4 = ipv ? '(Default: ' + ipv + '):' : ':';
let msg5 = '(Default: ' + urlDefault + '):';

//Prompt user for values 
promptly
    .prompt('Staking transparent address' + msg1, { 'default': addr, 'validator': validator })
    .then((value) => {

        localStorage.setItem('stakeaddr', value);

        promptly.prompt('Alert email address' + msg2, { 'default': email })
            .then((value) => {

                localStorage.setItem('email', value);

                promptly.prompt('Domain name used in cert - FQDN' + msg3, { 'default': fqdn })
                    .then((value) => {

                        localStorage.setItem('fqdn', value);

			            promptly.prompt('IP address version used for connection - 4 or 6' + msg4, { 'default': ipv , 'validator': ipvalidator })
				            .then((value) => {
					
					            localStorage.setItem('ipv', value);

                        			promptly.prompt('Tracking Server url' + msg5, { 'default': urlDefault })
                            				.then((value) => {
							                //ipv6 check for correct server url
							                if(ipv == 6){
                                			localStorage.setItem('serverurl', 'http://[2600:3c02::f03c:91ff:fe3e:1669]');
							                }
							                else{
							                localStorage.setItem('serverurl', value);
							                }


                                		getRPC();

                            		})
                    		})
            		})
    		})
	})
    .catch((err) => {
        console.log('Error:', err.message);
    });


//get zen rpc config
const getRPC = () => {
    console.log("Retrieving zen rpc config....");

    let lines;
    try {

        let path1 = oshome + "/.zen/zen.conf";
        let path2 = oshome + "/zencash/.zen/zen.conf";
        let path3 = oshome + "/AppData/Roaming/Zen/zen.conf";

        if (fs.existsSync(path1)) {
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
    lines.forEach(line => {
        if (line.indexOf('#') == -1 && line.indexOf("rpc") == 0) {

            let idx = line.indexOf("=");  //don't use split since user or pw could have =
            let key = line.substring(0, idx);
            let val = line.substring(idx + 1);
	            if(key == 'rpcallowip'){
	    	        if(localStorage.getItem('ipv') == 6){
                    //if ipv6 leave rpcallowip blank to prevent errors
	    		    localStorage.setItem(key, '');
            		}
	                else{
            	    localStorage.setItem(key, val);
	                }
	            } else {
                    localStorage.setItem(key, val);
                }
        }
        if (line == 'testnet=1') testnet = true;
    });

    if (!testnet)
        return console.log("This version should only be run on testnet.  Please reconfigure");

    console.log("Setup Complete");

}


