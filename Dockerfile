FROM land007/node:latest

MAINTAINER Yiqiu Jia <yiqiujia@hotmail.com>

RUN . $HOME/.nvm/nvm.sh && cd / && npm install ssh2
ADD getRemoteInfo.js /node_
ADD getRemoteInfo.json.json /node_

#docker build -t land007/node-ssh2:latest .
#> docker buildx build --platform linux/amd64,linux/arm64/v8,linux/arm/v7 -t land007/node-ssh2 --push .
#docker run --rm -it --name node-ssh2 -v ~/docker/node-ssh2:/node land007/node-ssh2:latest
#docker exec -it node-ssh2 bash
#docker save -o node-ssh2.tar land007/node-ssh2:latest
#gzip node-ssh2.tar
#docker load -i node-ssh2.tar.gz
