# nodetracker
#### ZenCash Secure And Super Node tracking app

This is installed on a Secure Node or a Super Node to allow it to communicate with the zensystem.io tracking server. It provides data to the server about the node and performs compliance challenges. Nodes that are in compliance receive a percentage of the block rewards. This runs completely separate from the zencash network.

Each node must have
  - a unique IP address (v4 or v6)
  - about 0.05 ZEN for challenges in one or more z-address on the node

  Secure Node
    - maintain a stake address with at least 42 ZEN
    - be able to perform challenges in less than 300 seconds
    - uptime of 92% or greater    
     
  Super Node
    - a stake address with at least 500 ZEN
    - be able to perform challenges in 150 seconds or 
    - uptime of 96% or greater

  See the [Secure Node About page](https://securenodes.zensystem.io/) or [Super Node About page](https://supernodes.zensystem.io/) on the tracking servers for details about compliance.  

## Version 0.3.0
This version is also used for Super Nodes.  A selection is made during the setup for the type of node.  

Along with some additional logging and formatting, this version also replaces the bitcoin-core and zcash node modules with a stdrpc module for communication with zend.

This version will check the zen configuration file to see if it is running on [testnet](https://securenodes-testnet.zensystem.io/) during the setup process.  There is no longer a need to edit the init.json file.


 
### UPDATE STEPS:
These are update instructions.  If you are doing a new install see the New Installation instructions further down or in the online [Installation Guide](https://documentation.zencash.com/display/ZEN/Installation)
  
  #### Check the version of nodejs
   1. Run: node -v
    
   - Suggested version is 8.x.x since it will have long term support. Node.js versions greater than this have not been tested but should work.

   To update or change run: 
      * sudo n lts

   #### Update nodetracker
   NOTE:  for backward compatibility the folder remains 'secnodetracker' even for Super Nodes.

  1. Change to the secnodetracker folder and update the tracker application. 
    This may be '~/zencash/secnodetracker' if the install guides were followed.

      * cd ~/zencash/secnodetracker

    Run the following commands:
      * git fetch origin
      * git checkout master
      * git pull

    If git complains about overwriting a file use: git checkout -- filename
        e.g. git checkout -- package.json
    Then run the 3 above commands again.

  2. Add node.js environment variable
    This will stop the next step from installing development libraries and allows node.js to run in production mode.
    *  NODE_ENV=production

  3. Install new nodejs module and remove old ones.

    * npm install
    * npm prune  

  4. Run setup (this will refresh the list of servers) in the tracker's config folder.
     You should be able to accept all the previous values.
      * node setup

  5. Stop the tracker application and restart it
      * Ctrl-c
      * node app
      * or restart using your management application such as PM2

  


## NEW INSTALLATION
If you have followed [Installation Guide](https://documentation.zencash.com/display/ZEN/Installation) for creating a Secure or Super Node, you should be ready to install this on your node. 

You will need about 0.05 zen in the node's wallet in a private address. Send multiple small amounts (0.0124 each) to work around an issue with 0 balances due to waiting for change to return after a challenge. Alternately create an additional private address and split the amount between them.

The private z-address needs to be created manually if not present (zen-cli z_getnewaddress).  If already present the balance is checked when the app starts and the address is displayed on the tracker console.

You will also need a transparent address in a wallet (not on the node) with at least 42 zen for a secure node or 500 zen for a super node. This balance will be checked during node registration on the server. This is not the address shown on the console (the t-address on the console is used as the node's identity). The stake address is also the payout address.

Note: real mainnet ZEN transparent addresses (t-address) start wtih a 'zn' (testnet addresses star with a 'zt').

These instructions should be run as the user set up in the guide (not root).

### Install npm and Node.js
Log into your node computer or vps.  The following commands install Node.js (a javascript virtual machine) and NPM (Node Package Manager)

  - Suggested version is 8.x.x since it will have long term support. Node.js versions greater than this have not been tested but should work.

  * sudo apt-get install npm
  * sudo npm install -g n
  * sudo n lts

### Clone this repository
If you followed the Guides you should have a ~/zencash folder with the zen folder in it. 
Put this repository in the zencash folder too or the folder of your choice.
Note:  if you would like to name the folder during the clone process, append the folder name to the clone command. The default is 'secnodetracker'.

  * cd ~/zencash
  * git clone https://github.com/ZencashOfficial/secnodetracker.git
  or
    git clone https://github.com/ZencashOfficial/secnodetracker.git nodetracker

### Set the environment variable for production
This will stop the next step from installing development libraries and allows node.js to run in production mode.
  * NODE_ENV=production
  
### Install the nodejs modules

   * cd secnodetracker
   * npm install
   
### Run setup
You will need your staking address (with at least 42 ZEN or 500 ZEN) and an email address for alerts (if you do not want alerts enter 'none' for the email address).  During setup press Enter to accept the default or enter new information.  See the Note below on finding the zen.conf file.

  * node setup


### Start the tracking app
Once setup is complete, start the tracker manually or with your system configuration or nodejs process monitor such as PM2.

  * node app
 
Follow any instructions shown on the console.  Rerun setup if needed: it will remember your previous values. 
Use Ctrl-c to break out of the app. 

**NOTE:**  There should only be 1 instance of the tracking app running at a time.  It is also best to wait to start the tracker until the blockchain is fully synced.
 
Check your node on one of the tracking servers using the Nodes>All Nodes page or the Nodes>My Nodes page.
  Secure Nodes - https://securenodes.zensystem.io
  Super Nodes - https://superenodes.zensystem.io
  
For any issues or help with a node, submit a ticket to [Support](https://support.zencash.com)

Report any critical issues on github https://github.com/ZencashOfficial/secnodetracker
For community support, ask question in the zencash Discord #securenodes channel. 


Instructions on installing a monitoring tool like nodemon or PM2 may be found separately.

**Locating zen.conf**
There are two optional environment variables that may be used to locate zen.conf which is needed for rpc configuration.

   ZENCONF - if this is found it must contain the full path to zen.conf including the file name.
   ZEN_HOME - if this is found it should be a base path. '/.zen/zen.conf' is appended to it.

   If the above two are not found the operating system is used for the home path.
   The search is then peformed in the following order:
      oshome + "/.zen/zen.conf";
      oshome + "/zencash/.zen/zen.conf";
      oshome + "/AppData/Roaming/Zen/zen.conf";


  


