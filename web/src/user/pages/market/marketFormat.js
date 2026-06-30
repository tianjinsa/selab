export const productStatusText = {
  on_sale: '在售',
  trading: '交易中',
  sold: '已售出',
  off_shelf: '已下架'
};

export const orderStatusText = {
  applying: '申请中',
  rejected: '已拒绝',
  waiting_payment: '待付款',
  waiting_delivery: '待交付',
  waiting_receive: '待收货',
  completed: '已完成',
  dispute: '纠纷中',
  cancelled: '已取消'
};

export function orderStatusType(status) {
  return {
    applying: 'warning',
    rejected: 'error',
    waiting_payment: 'warning',
    waiting_delivery: 'info',
    waiting_receive: 'info',
    completed: 'success',
    dispute: 'error',
    cancelled: 'default'
  }[status] || 'default';
}

export function productStatusType(status) {
  return {
    on_sale: 'success',
    trading: 'warning',
    sold: 'info',
    off_shelf: 'default'
  }[status] || 'default';
}

export function formatMoney(value) {
  return `￥${Number(value || 0).toFixed(2)}`;
}
