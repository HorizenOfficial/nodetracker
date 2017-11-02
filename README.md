# secnodetracker
#### ZenCash Secure Node tracking app

This is installed on a Secure Node to allow it to communicate with the zensystem.io tracking server. It provides data to the server about the Secure Node and performs compliance challenges. Nodes that are in compliance receive a percentage of the block rewards. This runs completely separate from the zen node network.  

## UPDATE 0.0.9 - BETA-Testnet
 - Added region selection in the setup
 - Added failover to other servers
 - Repository moved to zencashofficial

### About This Phase of the Beta
 This part of the beta involves switching all the testnet nodes over to the new sets of regional servers. Some of the priority items to test in this phase are: Node setup process, node failover, moving nodes between servers (changing home server), consistent info across servers, and.  The next phase will be migration of existing nodes to mainnet. Instructions will be published later for that phase.
 
There are now three sets of regional servers.  A node should select the closest region as a default.  
 
### IMPORTANT UPDATE STEPS -- Changing to a new repository and new servers:
These are upgrade and migration instructions.  If you are doing a new install see the New Installation instructions further down.

This version connects to new zensystem.io servers (NOT devtracksys.secnodes.com).
Setup has to be run.

  1. Delete the following files in the secnodetracker/config folder(unless you want to re-enter):
      - nodeid, serverurl, lastChalBlock, lastExecSec

  2. Change to the secnodetracker folder. The repository has to be changed then checked to ensure it matches.
   * git remote set-url origin https://github.com/ZencashOfficial/secnodetracker.git
   * git remote -v
  
  3. Update the files from github
   * git fetch origin
   * git checkout master
   * git pull

  3. Run the tracker setup and pay attention to the region. Enter another region code if it is not correct.
    * node setup

  4. Stop the tracker and restart it.  The tracker should connect to the new server and register.
    * Ctrl-c
    * node app


## Version Notes
This is Beta-Testnet and remains on the testnet. It will not work on the devtracksys.secnodes.com server.


## New Installation
If you have followed Part 1, Part 2, and Part 2.5 of guides for creating a Secure Node, you should be ready to install this on your node. More complete instructions will be added to Part 3 in the future.  

You will need about 1 zen in the node wallet in a private address. Send multiple small amounts (0.2 each) to work around an issue with 0 balances due to waiting for change to return after a challenge. 

The private z-address needs to be created manually if not present (zen-cli z_getnewaddress).  If already present the balance is checked when the app starts and the address is displayed on the tracker console.

You will also need a transparent address in a wallet (not on the node) with at least 42 zen so the node will register on the server. This is not the address shown on the console (the t-address on the console is used as the node's identity). The stake address is the payout address.

If you need some testnet zen (znt) please ask in the channel and post your transparent address (starts with 'zt' in testnet): someone will send some to you.

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
You will need your staking address (with at least 42zen - znt for testnet) and an email address for alerts (if you do not want alerts enter 'none' for the email address).  During setup press Enter to accept the default or enter the information.

  * node setup


### Start the tracking app

  * node app
 
Follow any instructions shown on the console.  Rerun setup if needed: it will remember your previous values. 
Use Ctrl-c to break out of the app. 

**NOTE:**  There should only be 1 instance of the tracking app running at a time.
 
Check your node on the tracking server:  https://securenodes.zensystem.io
  
Report any critical issues to @devman or ask for help in the zencash slack #securenodes channel. 


Instructions on installing a monitoring tool like nodemon or PM2 will be included later so the app can run in the background and start on reboot. If you want to install something now checkout PM2.


  


