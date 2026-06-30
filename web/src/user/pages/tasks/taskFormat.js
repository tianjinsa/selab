export const taskStatusText = {
  editing: '待支付',
  open: '招募中',
  accepted: '已接单',
  submitted: '待验收',
  timeout: '已超时',
  dispute: '纠纷中',
  completed: '已完成',
  cancelled: '已取消',
  closed: '已关闭'
};

export function taskStatusType(status) {
  return {
    editing: 'warning',
    open: 'success',
    accepted: 'info',
    submitted: 'warning',
    timeout: 'error',
    dispute: 'error',
    completed: 'success',
    cancelled: 'default',
    closed: 'default'
  }[status] || 'default';
}

export function formatMoney(value) {
  return `￥${Number(value || 0).toFixed(2)}`;
}
