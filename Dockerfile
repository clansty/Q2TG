FROM node:16
WORKDIR /usr/src/app
COPY package*.json ./
COPY yarn.lock ./
RUN yarn install
COPY * ./
VOLUME /usr/src/app/config.yaml
CMD [ "yarn", "start" ]
