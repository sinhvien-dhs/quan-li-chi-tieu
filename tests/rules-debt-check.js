/**
 * Mo phong dieu kien firestore.rules cho validDebt de tim dieu kien nao
 * tu choi payload that cua app.
 * Chuong trinh mo phong kieu du lieu Firestore: so nguyen -> int, con lai -> float.
 */
const d = {
  id: 't2',
  title: 'Bua an',
  total: 10000,
  perPerson: 5000,
  myAmount: 5000,
  myName: 'Toi',
  memberCount: 2,
  date: '2026-10-16',
  createdAt: new Date().toISOString(),
  debts: [{ name: 'An', amount: 5000, paid: false }]
};

const laInt = (n) => Number.isInteger(n);
const laSo = (n) => typeof n === 'number' && isFinite(n);
const laChuoi = (s) => typeof s === 'string';
const coKhoa = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const kiem = [];
const them = (ten, dk) => kiem.push({ ten, dk });

const allowed = ['id','title','total','perPerson','myAmount','myName','memberCount','date','createdAt','debts'];
const extra = Object.keys(d).filter(k => !allowed.includes(k));
them('chi co khoa duoc phep', extra.length === 0);
them('id la chuoi 1-64', laChuoi(d.id) && d.id.length > 0 && d.id.length <= 64);
them('title la chuoi 1-60', laChuoi(d.title) && d.title.length > 0 && d.title.length <= 60);
them('total la so 0..1e12', laSo(d.total) && d.total >= 0 && d.total <= 1e12);
them('perPerson la so', laSo(d.perPerson) && d.perPerson >= 0);
them('myAmount la so', laSo(d.myAmount) && d.myAmount >= 0);
them('myName la chuoi <=40', laChuoi(d.myName) && d.myName.length <= 40);
them('memberCount la so (KHONG dung "is int")', laSo(d.memberCount) && d.memberCount >= 0 && d.memberCount <= 30);
them('memberCount co phai int thuoc? (thong tin)', laInt(d.memberCount));
them('date hop le', /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date.length === 10);
them('createdAt la chuoi <=40', laChuoi(d.createdAt) && d.createdAt.length <= 40);
them('debts la danh sach <=30', Array.isArray(d.debts) && d.debts.length <= 30);
them('moi phan tu hop le', d.debts.every(x =>
  laChuoi(x.name) && x.name.length > 0 && x.name.length <= 40 &&
  laSo(x.amount) && x.amount >= 0 && (!coKhoa(x, 'paid') || typeof x.paid === 'boolean')));
const tongNo = d.debts.reduce((s, x) => s + x.amount, 0);
them('tong khop hoa don', tongNo === d.total - d.myAmount, tongNo + ' vs ' + (d.total - d.myAmount));

console.log('=== Kiem tra validDebt voi payload that ===');
let sai = 0;
kiem.forEach(k => {
  const mark = k.dk ? '  [DUNG] ' : '  [SAI ] ';
  if (!k.dk) sai++;
  console.log(mark + k.ten + (k.dk || k.dk === 0 ? '' : '  <-- ' + k.dk));
});
console.log('\nTong so dieu kien: ' + kiem.length + ', khong dat: ' + sai);
process.exit(sai > 0 ? 1 : 0);