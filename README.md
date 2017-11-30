# secnodetracker
#### ZenCash Secure Node tracking app

This is installed on a Secure Node to allow it to communicate with the zensystem.io tracking server. It provides data to the server about the Secure Node and performs compliance challenges. Nodes that are in compliance receive a percentage of the block rewards. This runs completely separate from the zen node network.

Each secure node must have a unique IP address (v4 or v6), a stake address with 42 ZEN, about 1 ZEN for challenges in a z-address on the node, and be able to perform challenges in less than 300 seconds.  See the About page on the server for more information.  


## UPDATE 0.1.0 - BETA-MAINNET
 - Updated for use on mainnet
 - Setup will use ZEN_HOME environment variable if found for the zen.conf file
 - Added check for a balance in all existing z-addresses to help work around 0 balance after a challenge

The regional servers run on mainnet as of December 1st 2017.

### About This Phase of the Beta - Mainnet
 This phase migrates existing nodes to mainnet. Earning and payouts start after a short testing period.
 
 
### IMPORTANT UPDATE STEPS -- Switching to mainnet:
These are upgrade and migration instructions.  If you are doing a new install see the New Installation instructions further down.

  #### Make sure your zen node is no longer on testnet.  
   1. Remove 'testnet=1' from your zen.conf 
   2. Stop zend:  zen-cli stop
   3. Start zend and let it sync with the main blockchain.
   4. Adjust steps as needed if using monitoring applications.

   #### Create a z_address for the challenges 
   1. Run: zen-cli z_getnewaddress
   2. Send 1 ZEN split into 4 to 5 separate transactions to that address.

   #### Prepare a stake address
   It is suggested a stake address exists that does not reside on the node.
   1. Identify your stake address or create one in a wallet. It must contain at least 42 ZEN.
  
  #### Check the version of nodejs
  Run: node -v
  Suggested version is 8.9.x since it will have long term support.
  To change: sudo n 8.9

   #### Update secnodetracker
  1. Stop the tracker application.

  2. Delete the following files in the secnodetracker/config folder:
      - nodeid, serverurl, lastChalBlock, lastExecSec, stakeaddr

  3. Change to the secnodetracker folder and update the tracker application. 
  This may be '~/zencash/secnodetracker' if the install guides were followed. Run the following commands:
   * git fetch origin
   * git checkout master
   * git pull


  4. If the servers are available, run the tracker setup and follow the prompts.
    * node setup

  5. If the servers are available, start the tracer app. The tracker should connect to the mainnet servers and register.
    * node app

  When the tracker successfully connects it will indicate it has registered and authenticated.


## Version Notes
This is Beta-Mainnet and is not meant to run on testnet. 


## New Installation
If you have followed Part 1, Part 2, and Part 2.5, and/or Part 3 of guides for creating a Secure Node, you should be ready to install this on your node. 

You will need about 1 zen in the node wallet in a private address. Send multiple small amounts (0.2 each) to work around an issue with 0 balances due to waiting for change to return after a challenge. 

The private z-address needs to be created manually if not present (zen-cli z_getnewaddress).  If already present the balance is checked when the app starts and the address is displayed on the tracker console.

You will also need a transparent address in a wallet (not on the node) with at least 42 zen so the node will register on the server. This is not the address shown on the console (the t-address on the console is used as the node's identity). The stake address is the payout address.

Note: real ZEN transparent addresses (t-address) start wtih a 'zn' (testnet addresses star with a 'zt').

### Install npm and Node.js
Log into your secure node.  The following installs the NPM and Node.js (a javascript virtual machine). 

  * sudo apt-get install npm
  * sudo npm install -g n
  * sudo n 8.9

### Clone this repository
If you followed the Guides you should have a ~/zencash folder with the zen folder in it. 
Put this repository in the zencash folder too. 

  * cd ~/zencash
  * git clone https://github.com/ZencashOfficial/secnodetracker.git
  
### Install the nodejs modules

   * cd secnodetracker
   * npm install
   
### Run setup
You will need your staking address (with at least 42 ZEN) and an email address for alerts (if you do not want alerts enter 'none' for the email address).  During setup press Enter to accept the default or enter new information.

  * node setup


### Start the tracking app

  * node app
 
Follow any instructions shown on the console.  Rerun setup if needed: it will remember your previous values. 
Use Ctrl-c to break out of the app. 

**NOTE:**  There should only be 1 instance of the tracking app running at a time.
 
Check your node on the tracking server:  https://securenodes.zensystem.io
  
Report any critical issues on github https://github.com/ZencashOfficial/secnodetracker
For community support, ask question in the zencash Discord #securenodes channel. 


Instructions on installing a monitoring tool like nodemon or PM2 may be found separately.

  


