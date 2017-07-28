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

//get values if setup rerun
let addr = localStorage.getItem('stakeaddr') || null;
let email = localStorage.getItem('email') || null;
let urlDefault = 'https://tracksys.zensystem.io';

let msg1 = addr ? ' (Default: ' + addr + '):' : ':';
let msg2 = email ? '(Default: ' + email + '):' : ':';
let msg3 = '(Default: ' + urlDefault + '):';

//Prompt user for values 
promptly
    .prompt('Staking transparent address' + msg1, { 'default': addr, 'validator': validator })
    .then((value) => {

        localStorage.setItem('stakeaddr', value);

        promptly.prompt('Alert email address' + msg2, { 'default': email })
            .then((value) => {

                localStorage.setItem('email', value);

                promptly.prompt('Server url' + msg3, { 'default': urlDefault })
                    .then((value) => {

                        localStorage.setItem('serverurl', value);

                        getRPC();

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

		let path1 = oshome + "/zencash/.zen/zen.conf";
        let path2 = oshome +  "/.zen/zen.conf";
        
		if (fs.existsSync(path1)){
			lines = fs.readFileSync(path1, "utf8").split("\n");
		}else if (fs.existsSync(path2)){
			lines = fs.readFileSync(path2, "utf8").split("\n");
		}

		//console.log(path);
    }
    catch (e) {
        console.log("ERROR finding or reading zen.conf file. Make sure the zen secure node is set up properly.");
        process.exit();
    }

    lines.pop();

    let config = {};
    lines.forEach(line => {
        if (line.indexOf('#') == -1 && line.indexOf("rpc") == 0) {

            let idx = line.indexOf("=");  //don't use split since user or pw could have =
            let key = line.substring(0, idx);
            let val = line.substring(idx + 1);
            localStorage.setItem(key, val);

        }
    });

    console.log("Setup Complete");

}


