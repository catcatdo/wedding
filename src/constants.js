const HEADERS = [
  'id',
  '거래일시',
  '출금',
  '거래내용',
  '상대계좌번호',
  '상대은행',
  '상대계좌예금주명',
  '전화번호',
  '메모'
];

const USER_EDITABLE_FIELDS = ['전화번호'];
const ADMIN_EDITABLE_FIELDS = ['전화번호', '메모', '거래내용', '상대은행', '상대계좌번호', '상대계좌예금주명'];

module.exports = {
  HEADERS,
  USER_EDITABLE_FIELDS,
  ADMIN_EDITABLE_FIELDS
};
