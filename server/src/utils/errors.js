export class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFound(message = '资源不存在') {
  return new ApiError(404, message);
}

export function forbidden(message = '没有权限执行该操作') {
  return new ApiError(403, message);
}

export function badRequest(message = '请求参数不正确', details = null) {
  return new ApiError(400, message, details);
}
