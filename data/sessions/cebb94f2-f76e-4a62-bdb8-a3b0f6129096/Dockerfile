# 完整的 Dockerfile，包含所有必要的階段
FROM node:18

# 設定工作目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json
COPY package.json package-lock.json ./

# 安裝依賴
RUN npm install

# 複製其餘的應用程式檔案
COPY . .

# 暴露應用程式埠
EXPOSE 3000

# 啟動應用程式
CMD ["npm", "start"]
