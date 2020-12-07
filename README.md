# nodetracker
#### Horizen Secure And Super Node tracking app

This application is installed on a Secure Node or a Super Node to allow it to communicate with its corresponding zensystem.io tracking server. It provides data to the server about the node and performs compliance challenges. Nodes that are in compliance receive a percentage of the block rewards. The tracking networks runs completely separate from the horizen network.

Each nodetracker must have
  - a unique IP address (v4 or v6) also used by zend
  - about 0.01 ZEN for challenges in one or more z-address on the node

  Secure Node
    - maintain a stake address with at least 42 ZEN
    - be able to perform challenges in 300 seconds or under (or as posted)
    - uptime of 92% or greater
     
  Super Node
    - a stake address with at least 500 ZEN
    - be able to perform challenges in 150 seconds or under (or as posted)
    - uptime of 96% or greater
    - zend configured with both IPv4 and IPv6 addresses 

  See the [Secure Node About page](https://securenodes.zensystem.io/) or [Super Node About page](https://supernodes.zensystem.io/) on the tracking servers for full details about compliance.  

  See the [Installation Guide](https://horizenofficial.atlassian.net/wiki/spaces/ZEN/pages/136872139/Installation) for detailed configuration steps.

## Changes

  #### 0.4.0
    - Randomize delay before reconnect
    - Remove socket reinit on reconnect
    - Add drop socket and connect on server request
    - Include region in move home
    - Remove tls peers on stats check
    - Add tls peers on server request
    - Add stat acknowledgment random timeouts before reset socket
    - Add save application settings to local update from tracking server
    - Add multiple zaddr check to use highest balance
    - Add latency check based on socket level ping/pong
    - Add periodic ‘checkIn’ (ping/pong) at application level
    - Add error check and retry timer on failure to get zaddress balance
    - Save application settings to local and allow updates from server
    - Add ipv6 lookup family to ipv6 dns workaround (credit to emminer - thanks!)
    - Challenge: low balance no longer creates Exception. Fails on no funds.
    - Current server saved to config/local for external scripts 

  #### 0.3.1
    - added zen.conf requirements for externalip and port.
    - fixed maintaining nodeid on setup rerun


 
### UPDATE STEPS:
These are general update instructions. For full instructions please use the [Maintenance Guide](https://horizenofficial.atlassian.net/wiki/spaces/ZEN/pages/136871983/Maintenance)

If you are doing a new install the general New Installation instructions further down can be used but the best option is to use the online [Installation Guide](https://horizenofficial.atlassian.net/wiki/spaces/ZEN/pages/136872139/Installation)
  
  #### Check the version of nodejs
   1. Run the following command
      * node -v
    
   - Suggested version is 10.x.x since it will have long term support. Node.js versions greater than this have not been tested but may work.

    To update or change run:
      * sudo n lts

   #### Update nodetracker
   NOTE:  for backward compatibility the folder can be named 'secnodetracker' even for Super Nodes. However if you would like to change the folder please see the upgrade section in the installation guide

  1. Change to the nodetracker folder and update the tracker application. This may be 'zencash/secnodetracker' if the old install guides were followed.

      * cd ~/nodetracker
      * git fetch origin
      * git checkout master
      * git pull

    If git complains about overwriting a file use: git checkout -- filename
        e.g. git checkout -- package.json
    Then run the last 3 above commands again.


  2. Install/update new nodejs modules and remove old ones. Use a node.js environment variable when updating the npm modules. This will stop npm from installing development libraries. 

      *  NODE_ENV=production npm install 

  3. Stop the tracker application and restart it

      * Ctrl-c
      * node app
      * or restart using your management application such as PM2 or systemd

  


## NEW INSTALLATION
It is suggested you follow the much more detailed [Installation Guide](https://horizenofficial.atlassian.net/wiki/spaces/ZEN/pages/136872139/Installation) for creating a Secure or Super Node. The instructions below are general instructions for the nodetracker.

You will need about 0.04 zen in the node's wallet in a private address. Send multiple small amounts (0.01 each) to work around an issue with 0 balances due to waiting for change to return after a challenge. Alternately create an additional private z-address and split the amount between them.

The private z-address needs to be created manually if not present (zen-cli z_getnewaddress).  If already present the balance is checked when the app starts and the address is displayed on the tracker console or in the logs.

You will also need a transparent address in a wallet (not on the node) with at least 42 zen for a secure node or 500 zen for a super node. This balance will be checked during node registration on the server. This is not the address shown on the console (the t-address on the console is used as part of the node's identity). The stake address is also the payout address.

Note: real mainnet ZEN transparent addresses (t-address) start wtih a 'zn' (testnet addresses star with a 'zt').

These instructions should be run as the user created in the guide (not root).

### Install npm and Node.js
Log into your node computer or vps.  The following commands install Node.js (a javascript virtual machine) and NPM (Node Package Manager)

  - Suggested version is 10.13.x (or higher 10.x) since it will have long term support. Node.js versions greater than this have not been tested but should work.

  * sudo apt-get install npm
  * sudo npm install -g n
  * sudo n lts

### Clone this repository

Note:  if you would like to name the folder during the clone process, append the folder name to the clone command. The default is 'nodetracker'.

  * cd ~/
  * git clone https://github.com/HorizenOfficial/nodetracker.git 

  or to specify a folder name 
    git clone https://github.com/HorizenOfficial/nodetracker.git nodetracker


### Install the nodejs modules
  Use the environment variable to keep from installing development libraries. If a different folder was specified substitute its name

   * cd nodetracker
   * NODE_ENV=production npm install
   
### Run setup
You will need your staking address (with at least 42 ZEN for Secure Nodes or 500 ZEN for Super Nodes) and an email address for alerts (if you do not want alerts enter 'none' for the email address or leave it blank. NOTE: an email address is required for all the 'My' pages on the tracking server and the API).

During setup press Enter to accept the default and enter new information when prompted.  See the Note below on finding the zen.conf file if it is not in its standard location.

There is a prompt for an optional category. This allows a node operator with multiple nodes to group them together.

  * node setup

NOTE:  The setup process will stop if zen.conf does not have certain entries. Update the zen.conf file and rerun setup until it completes successfully.


### Start the tracking app
Before starting the nodetracker make sure the blockchain is fully synced and the stake address has the correct confirmed amount.

Once setup is complete, start the tracker manually or with your system configuration or nodejs process monitor such as PM2 or if you have it configured to use systemd.

  * node app
 
Follow any instructions shown on the console.  Rerun setup if needed: it will remember your previous values. 
Use Ctrl-c to break out of the app if running directly in nodejs.

**NOTE:**  There should only be 1 instance of the tracking app running at a time.
 
### Check the node on the Tracking Server
Check your node on one of the tracking servers using the 'Nodes>All Nodes' page or the 'Nodes>My Nodes' page (after generating an API key).
  * Secure Nodes - https://securenodes.zensystem.io
  * Super Nodes - https://supernodes.zensystem.io
  

For any issues or help with a node, submit a ticket to [Support](https://support.horizen.global)

For community support, ask questions in the Horizen Discord [#node_tech_support](https://discordapp.com/invite/Hu5mQxR) channel. 


Instructions on installing a monitoring tool like nodemon or PM2 may be found separately. The suggested monitoring method is in the Installation Guide



**Locating zen.conf**
There are two optional environment variables that may be used to locate zen.conf which is needed for rpc configuration.


  * ZENCONF - if this is found it must contain the full path to zen.conf including the file name.
  * ZEN_HOME - if this is found it should be a base path. '/.zen/zen.conf' is appended to it.

  - If the above two are not found the operating system is used for the home path.
  - The search is then performed in the following order:
      - oshome + "/.zen/zen.conf";
      - oshome + "/zencash/.zen/zen.conf";
      - oshome + "/AppData/Roaming/Zen/zen.conf";
      
