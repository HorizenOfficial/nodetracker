# secnodetracker
#### ZenCash Secure Node tracking app

This is installed on a Secure Node to allow it to communicate with the zensystem.io tracking server. It provides data to the server about the node and performs compliance challenges. It is very lightweight as it only needs to act as a connector between the node and server.

## UPDATE 0.0.4
Added prompt for FQDN to setup
Updated stats to get private addr bal
Changed mem check to /proc/meminfo for linux
Check for lost operations
Add mem checks to before and near end of challenge
Fixed 'get config' on registration
Work arounds for 0 bal after challenge, skip alert
 

RUN SETUP after updating.

Upate from github:

   * git fetch origin
   * git checkout master
   * git pull

Run: node setup
Restart secnodetracker.


## Version Notes
This software is still under development.  It is being provided in an incomplete alpha state for testing of data gathering and event tracking. One step closer to the payment system.  The tracking system and challenges are ready for testing as of 0.0.3. 


## Installation
If you have followed Part 1 and Part 2 of creating a Secure Node, you should be ready to install this on the secure node. More complete instructions will be added to Part 3.  

You will need at least .5 zen in the node wallet. The balance is checked when the app starts and will show the address on the console.
You will also need an address with at least 42 zen so the node will register on the server.

### Install npm and Node.js
Login to your secure node.  This will install NPM and 8.2.1 or above of Node.js. 

  * sudo apt-get install npm
  * sudo npm install -g n
  * sudo n latest

### Clone this repository
put the repository in the same folder as zen
  * cd ~/zencash
  * git clone https://github.com/ADumaine/secnodetracker.git
  
### Install the node modules
   * cd secnodetracker
   * npm install
   
### Run setup
You will need your staking address (with at least 42zen) and an email address for alerts (not implemented yet).
The setup prompts for the address and email and allows you to override the default address of the tracking server.

  * node setup.js

### Start the tracking app
  * node app.js
 
Follow any instructions shown on the console.  Rerun setup if needed: it will remember your previous values. 
Use Ctrl-C to break out of the app.
 
Check your node at http://devtracksys.secnodes.com
  
Report any issues to @devman in the zencash slack #securenodes channel. 

Instructions on installing a monitoring tool like nodemon or pm2 will be included later so the app can run within a daemon wrapper (in the background).


  


