import config from '~/config';

const baseUrl = config.apiBaseUrl;

function isSuccessResponse(res) {
  const body = res.data || res;
  return res.statusCode === 200 || res.code === 200 || body.code === 200 || body.success === true;
}

function request(url, method = 'GET', data = {}) {
  const header = {
    'content-type': 'application/json',
  };
  const tokenString = wx.getStorageSync('access_token');
  if (tokenString) {
    header.Authorization = `Bearer ${tokenString}`;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl + url,
      method,
      data,
      dataType: 'json',
      header,
      success(res) {
        if (isSuccessResponse(res)) resolve(res);
        else reject(res);
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

export default request;
