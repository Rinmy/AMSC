FROM node:16.6.2

RUN npm install -g discord.js
RUN npm install -g @google-cloud/compute

COPY ./src/ /amsc/
