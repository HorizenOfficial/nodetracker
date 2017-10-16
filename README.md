# secnodetracker
#### ZenCash Secure Node tracking app

This is installed on a Secure Node to allow it to communicate with the zensystem.io tracking server. It provides data to the server about the node and performs compliance challenges. It is very lightweight as it only needs to act as a connector between the node and server.

## UPDATE 0.0.7 - BETA-Testnet
 - Added region selection in the setup
 - Added failover to other servers
 - Repository moved to zencashofficial
 
### IMPORTANT UPDATE STEPS -- Changing to a new repository:
These are upgrade instructions.  If you are doing a new install seen the Installation instruction further down.
This version connects to new zensystem.io servers (NOT devtracksys.secnodes.com).
Setup needs to be re-run.

  1. Remove all the files in the tracker config folder

  2. From within the secnodetracker folder. Change repositories then check if it matches.
   * git remote set-url origin https://github.com/ZencashOfficial/secnodetracker.git
   * git remote -v
  
  3. Update the files from github
   * git fetch origin
   * git checkout dev  (<-- be sure to checkout dev branch)
   * git pull

  3. Run the tracker setup and select a region:  node setup
  4. Stop the tracker and restart it.  The tracker should register and connect to the new server.


## Version Notes
This is the Beta 1 and will be on testnet to ensure the multiserver environment is working properly.


## New Installation
If you have followed Part 1, Part 2, and Part 2.5 of creating a Secure Node, you should be ready to install this on your secure node. More complete instructions will be added to Part 3 in the future.  

You will need about 1 zen in the node wallet in a private address. Send multiple small amounts (0.2 each). The private z-address needs to be created manually if not present (zen-cli z_getnewaddress).  If already present the balance is checked when the app starts and the address is dsiplayed on the tracker console.

You will also need a t-address in a wallet (preferrably not on the node) with at least 42 zen so the node will register on the server. This is not the address shown on the console (the t-address on the console is used as the node's identity). 

### Install npm and Node.js
Login to your secure node.  This will install NPM and 8.6.0 or above of Node.js (a javascript vm). 

  * sudo apt-get install npm
  * sudo npm install -g n
  * sudo n latest

### Clone this repository
If you followed the Guide you should have a ~/zencash folder with the zen folder in it. 
Put this repository in the zencash folder too. 

  * cd ~/zencash
  * git clone https://github.com/ZencashOfficial/secnodetracker.git
  
### Install the nodejs modules

   * cd secnodetracker
   * npm install
   
### Run setup
You will need your staking address (with at least 42zen) and an email address for alerts (if you do not want alert enter 'none' for the email address).

  * node setup.js


### Start the tracking app

  * node app.js
 
Follow any instructions shown on the console.  Rerun setup if needed: it will remember your previous values. 
Use Ctrl-C to break out of the app. NOTE:  There should only be 1 instance of the tracking app running at a time.
 
Check your node on your home server or https://web1.na.zensystem.io
  
Report any issues to @devman in the zencash slack #securenodes channel. 



Instructions on installing a monitoring tool like nodemon or pm2 will be included later so the app can run within a daemon wrapper (in the background).


  


