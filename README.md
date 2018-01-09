# secnodetracker
#### ZenCash Secure Node tracking app

This is installed on a Secure Node to allow it to communicate with the zensystem.io tracking server. It provides data to the server about the Secure Node and performs compliance challenges. Nodes that are in compliance receive a percentage of the block rewards. This runs completely separate from the zen node network.

Each secure node must have a unique IP address (v4 or v6), a stake address with 42 ZEN, about 1 ZEN for challenges in a z-address on the node, and be able to perform challenges in less than 300 seconds.  See the About page on the server for more information.  


## UPDATE 0.2.0 - BETA-MAINNET
 - Add ability to assign home server for load balancing
 - Add ability to update server list for failover
 - Fix status when zen is back up
 - Add an environment variable for zen.conf
 
 
### IMPORTANT UPDATE STEPS:
These are update instructions.  If you are doing a new install see the New Installation instructions further down.
  
  #### Check the version of nodejs
   1. Run: node -v
    
   - Suggested version is 8.9.x since it will have long term support. 
   To change run: 
      * sudo n 8.9

   #### Update secnodetracker
 

  1. Change to the secnodetracker folder and update the tracker application. 
    This may be '~/zencash/secnodetracker' if the install guides were followed.
    Run the following commands:
      * git fetch origin
      * git checkout master
      * git pull

    If git complains about overwritting a file use: git checkout -- filename
    Then run the above commands again

  2. Run setup (this will refresh the list of servers) in the scenodetracker folder.
     You should be able to accept all the previous values.
      * node setup

  2. Stop the tracker application and restart it
      * Ctrl-c
      * node app
      * or restart using your managment application such as PM2

  
## Version Notes
This is Beta-Mainnet but may be run on testnet following the instructions on the testnet home page: https://securenodes-testnet.zensystem.io/ 


## New Installation
If you have followed Part 1, Part 2, and Part 2.5, and/or Part 3 of guides for creating a Secure Node, you should be ready to install this on your node. 

You will need about 1 zen in the node wallet in a private address. Send multiple small amounts (0.2 each) to work around an issue with 0 balances due to waiting for change to return after a challenge. Alternately create an additional private address and split the amounts between them.

The private z-address needs to be created manually if not present (zen-cli z_getnewaddress).  If already present the balance is checked when the app starts and the address is displayed on the tracker console.

You will also need a transparent address in a wallet (not on the node) with at least 42 zen so the node will register on the server. This is not the address shown on the console (the t-address on the console is used as the node's identity). The stake address is the payout address.

Note: real ZEN transparent addresses (t-address) start wtih a 'zn' (testnet addresses star with a 'zt').

### Install npm and Node.js
Log into your secure node.  The following installs the NPM and Node.js (a javascript virtual machine). 
  - Suggested version is 8.9.x since it will have long term support. 
  
  * sudo apt-get install npm
  * sudo npm install -g n
  * sudo n 8.9

### Clone this repository
If you followed the Guides you should have a ~/zencash folder with the zen folder in it. 
Put this repository in the zencash folder too or the folder of your choice.

  * cd ~/zencash
  * git clone https://github.com/ZencashOfficial/secnodetracker.git
  
### Install the nodejs modules

   * cd secnodetracker
   * npm install
   
### Run setup
You will need your staking address (with at least 42 ZEN) and an email address for alerts (if you do not want alerts enter 'none' for the email address).  During setup press Enter to accept the default or enter new information.  See the Note below on finding the zen.conf file.

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

**Locating zen.conf**
There are two optional environment variables that may be used to locate zen.conf which is needed for rpc configuration.

   ZENCONF - if this is found it must contain the full path to zen.conf including the file name.
   ZEN_HOME - if this is found it should be a base path. '/.zen/zen.conf' is appended to it.

   If the above two are not found the operating system is used for the home path.
   The search is then peformed in the following order:
      oshome + "/.zen/zen.conf";
      oshome + "/zencash/.zen/zen.conf";
      oshome + "/AppData/Roaming/Zen/zen.conf";


  


