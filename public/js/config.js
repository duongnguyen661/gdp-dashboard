// Cấu hình quán — chỉnh ở đây là xong, không cần đụng code khác.
export const CONFIG = {
  streetName: 'PHỐ NHẬU 24H',      // tên trên biển đường
  crossStreetName: 'NGÃ TƯ CHỢ ĐÊM',
  tables: 20,                      // số bàn
  seatsPerTable: 4,                // ghế mỗi bàn  -> ghế đánh số 1..80
  freeBeersPerPerson: 2,           // bia miễn phí cho mỗi người
  freePeanutPerTable: 1,           // đĩa lạc miễn phí cho mỗi bàn
  freeStaySec: 120,                // không thả quà -> sau ngần này giây mời xuống
  paidStaySec: 15 * 60,            // khách đã thả quà: ngồi tối đa ngần này giây kể từ lần hoạt động cuối
  maxSpectators: 40,               // số người xem tối đa đứng ngoài vỉa hè
  maxPerOrder: 4,                  // 1 comment gọi tối đa mấy ly/đĩa
  tableFullThrottleSec: 15,        // chống đọc "bàn full" lặp liên tục

  // Thực đơn. gift = số kim cương (xu) tối thiểu để gọi món bằng quà. free = có suất miễn phí.
  // aliases viết KHÔNG DẤU, chữ thường.
  menu: {
    bia:  { name: 'bia',                 gift: 1,  aliases: ['bia', 'beer', 'bia hoi'] },
    lac:  { name: 'đĩa lạc rang',        gift: 5,  aliases: ['lac rang', 'lac', 'dau phong'] },
    dau:  { name: 'đậu nướng mỡ hành',   gift: 10, aliases: ['dau nuong mo hanh', 'dau nuong', 'mo hanh', 'dau'] },
    bo:   { name: 'thịt bò xào',         gift: 30, aliases: ['thit bo', 'bo xao', 'bo'] },
    lau:  { name: 'nồi lẩu bò',          gift: 99, aliases: ['lau bo', 'lau'] },
  },
};
