FROM node:22
COPY . /app
WORKDIR /app
RUN npm install
RUN npm install -g nodemon
ENV NODE_ENV=development
CMD npm start
