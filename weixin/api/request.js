import config from '~/config';

const baseUrl = config.apiBaseUrl;
const delay = 0;

function isSuccessResponse(res) {
  const body = res.data || res;
  return res.statusCode === 200 || res.code === 200 || body.code === 200 || body.success === true;
}

function request(url, method = 'GET', data = {}) {
  const header = {
    'content-type': 'application/json',
    // 有其他content-type需求加点逻辑判断处理即可
  };
  // 获取token，有就丢进请求头
  const tokenString = wx.getStorageSync('access_token');
  if (tokenString) {
    header.Authorization = `Bearer ${tokenString}`;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl + url,
      method,
      data,
      dataType: 'json', // 微信官方文档中介绍会对数据进行一次JSON.parse
      header,
      success(res) {
        setTimeout(() => {
          if (isSuccessResponse(res)) {
            resolve(res);
          } else {
            // wx.request的特性，只要有响应就会走success回调，所以在这里判断状态，非200的均视为请求失败
            reject(res);
          }
        }, delay);
      },
      fail(err) {
        setTimeout(() => {
          // 断网、服务器挂了都会fail回调，直接reject即可
          reject(err);
        }, delay);
      },
    });
  });
}

// 导出请求和服务地址
export default request;
