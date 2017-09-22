# secnodetracker
#### ZenCash Secure Node tracking app

This is installed on a Secure Node to allow it to communicate with the zensystem.io tracking server. It provides data to the server about the node and performs compliance challenges. It is very lightweight as it only needs to act as a connector between the node and server.

## UPDATE 0.0.6
 - Added collection of peers info for verifying TLS connections
 - Added error checking if zen is loading when tracker restarts
 - Added check for ipv6 in setup (thanks to @num81)
 
 

RUN SETUP: not needed for this update unless you are running ipv6 only and would like to test.

Update from github:

   * git fetch origin
   * git checkout master
   * git pull


Restart secnodetracker app.


## Version Notes
This software is still under development and active alpha testing.


## Installation
If you have followed Part 1, Part 2, and Part 2.5 of creating a Secure Node, you should be ready to install this on your secure node. More complete instructions will be added to Part 3 in the future.  

You will need at least 1 zen in the node wallet in a private address. The balance is checked when the app starts and will show the address on the console.

You will also need an address with at least 42 zen so the node will register on the server.  This stake address does not have to be on the node. 

### Install npm and Node.js
Login to your secure node.  This will install NPM and 8.5.0 or above of Node.js. 

  * sudo apt-get install npm
  * sudo npm install -g n
  * sudo n latest

### Clone this repository
If you followed the Guide you should have a ~/zencash folder with zen folder in it. 
Put this repository in the zencash folder too. 
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


  


