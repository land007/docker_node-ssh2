const Client = require('ssh2').Client;
const EventProxy = require('eventproxy');
const Bagpipe = require('bagpipe');
const PipeMax = process.env['PIPEMAX'] || '20';// 同时任务数
const bagpipe = new Bagpipe(parseInt(PipeMax));
const ep = new EventProxy();

const crypto = require('crypto');

const path = require('path');
const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const KEY = 'dkksldwerq';

const aesDecrypt = function(encrypted, key) {
  const decipher = crypto.createDecipher('aes192', key);
  var decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

process.on('uncaughtException', function (err) {
    //console.log('uncaughtException', err);
});

const command = '\
gid=`id -g`; \
source /etc/os-release; \
echo $NAME; \
echo $VERSION_ID; \
cat /proc/cpuinfo |grep "model name" |wc -l |awk \'{printf "%d\\n", $1}\'; \
echo "`cat /proc/meminfo |grep MemTotal |awk \'{printf $2}\'`/1000/1000"| bc; \
if [ $gid == 0 ]; then  fdisk -l | grep "/dev/" | awk -F \'[ :,]+\' \'{printf "%.0f\\n",$5/1024/1024/1024}\' | awk -v total=0 \'{total+=$1}END{printf "%.0f\\n",total}\'; else echo "not root";  fi;\
df -k | grep -v "tmpfs" | egrep -A 1 "mapper|dev" | awk \'NF>1{print $(NF-3)}\' | awk -v used=0 \'{used+=$1}END{printf "%.2f\\n",used/1024/1024}\'; \
netstat -an |grep LISTEN |grep -v LISTENING |awk \'{print $4}\'| rev |cut -d ":" -f 1 | rev |sort -n |uniq |awk \'{printf "%d,", $1}\'; echo ""; \
hostname; \
netstat -an |grep ESTABLISHED |awk \'{printf "%s_%s,", $4, $5}\'; \
echo ""; \
if [ ! -f "/etc/redhat-release" ]; then  echo "not centos"; else cat /etc/redhat-release; fi; \
id -g; \
\n\
';
console.log(command);
//console.log('command: ', command);

var main = async function() {
//	items = getIps(excel);
	var jsonpath = __dirname + path.sep +'getRemoteInfo.json.json';
	console.log('jsonpath', jsonpath);
	var jsons = await readFile(jsonpath);
	var items = JSON.parse(jsons);
	for(var i = 0; i < items.length; i++) {
		var item = items[i];
		if(item.cmds) {
			item.cmds = JSON.parse(aesDecrypt(item.cmds, KEY));
		}
		if(item.login_pass) {
			item.login_pass = aesDecrypt(item.login_pass, KEY);
		}
	}
	ep.after('get_item', items.length, async function (_items) {
		console.log('get_all_item');
		for(let i in _items) {
			delete items[_items[i].i].login_pass;
			delete items[_items[i].i].cmds;
			items[_items[i].i].info = _items[i].info;
		}
		console.log('items', items);
		var remoteinfopath = __dirname + path.sep +'getRemoteInfo.info.json';
		await writeFile(remoteinfopath, JSON.stringify(items, null, 4));
	});
	for (let i = 0; i < items.length; i++) {
		bagpipe.push(getRemotInfo, items[i], function (info) {
			console.log('get_item', i);
			ep.emit('get_item', {i: i, info: info});
		});
	}
};

const exec = function(conn, cmds) {
//	console.log('=======================cmds', cmds);
	return new Promise(
			function(resolve, reject) {
				conn.shell(function(err, stream) {
					if (err) {
						console.log('FIRST :: exec error: ' + err);
						conn.end();
						reject(err);
					}
					let body = '';
					stream.on('close', function(code, signal) {
//						console.log('=======================close');
						resolve(body);
					}).on('data', function(buffer) {
						let _data = buffer.toString('utf-8');
						let data = _data.replace(/\x1B\[([0-9]{1,2}(;[0-9]{1,2})?)?[m|K]/g, '');
						process.stdout.write(data);
						if (data.endsWith('$ ') || data.endsWith('# ') || data.endsWith('Password: ') || data.endsWith('密码：')) {
		    				  let cmd = cmds.shift();
		    				  if(cmd !== undefined) {
		    					  try {
		    						  stream.write(cmd);
		    					  } catch (e) {
		    					  }
		    				  } else {
		    					  conn.end();
		    				  }
						} else {
							if(cmds.length == 0) {
								body += data;
							}
						}
					}).stderr.on('data', function(data) {
						console.log('STDERR: ' + data);
					}).on('end', function() {
//						console.log('=======================end');
					});
				});
			}
	);
};

const getRemotInfo = function(hostinfo, callback){
		let timeout = setTimeout(function(){
//			conn1.close();
			timeout = null;
			callback({});
		}, 5000);
		let conn1 = new Client();
		conn1.on('ready', async function() {
			if(timeout == null) {
				return;
			}
			clearTimeout(timeout);
//			console.log('FIRST :: connection ready');
//			console.log('hostinfo.cmds1', hostinfo.cmds);
			hostinfo.cmds.push(command);
//			console.log('hostinfo.cmds2', hostinfo.cmds);
			let str = await exec(conn1, hostinfo.cmds);
//			console.log('=====================');
//			console.log(str);
//			console.log('=====================');
//			let list = str.split('\n');
			let list = str.split('\r\n');
//			console.log(list);
			let obj = {};
			let i = 1;
			obj.system = list[0+i];
			obj.system_version = list[1+i];
			obj.cpu = list[2+i];
			obj.memory = list[3+i];
			obj.disk = list[4+i];
			obj.disk_use = list[5+i];
			obj.port = list[6+i];
			obj.hostname = list[7+i];
			obj.established = list[8+i];
			obj.vv = list[9+i];
			obj.gid =  list[10+i];
//			var reg = new RegExp(/\d+(\.\d+)+/);
//			console.log('obj.vv', obj.vv);
//			console.log('reg.exec(obj.vv)', reg.exec(obj.vv));
//			obj.vvv = reg.exec(obj.vv)[0];
//			console.log(obj);
			console.log('hostinfo.cmds',  hostinfo.cmds);
			for (let c in hostinfo.cmds) {
				var str2 = await exec(conn1, hostinfo.cmds[c]);
				console.log('str2', str2);
			}
			callback(obj);
		}).connect(	{
			host : hostinfo.ip,
			port : hostinfo.port,
			username : hostinfo.login_name,
			password : hostinfo.login_pass
		});
};

main();
