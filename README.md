# Quán nhậu 3D – live TikTok

Phố nhậu 3D ở ngã tư: 20 bàn × 4 ghế (ghế 1–80) sát vỉa hè, cột đèn + biển tên đường, nhà cao tầng, tháp Eiffel.
Người xem **comment / thả quà** trên TikTok Live để vào bàn và gọi món.

## Chạy

```bash
npm install
npm start -- tenTikTokCuaBan      # tên TikTok đang live (không cần @)
```

Mở http://localhost:3000 rồi bấm **BẮT ĐẦU** (trình duyệt cần 1 cú bấm mới cho phát âm thanh).

- Thử không cần live: http://localhost:3000/?demo=1 (bot tự vào bàn, gọi món)
- Nút **⚙ Bảng điều khiển** (góc trái dưới, hoặc phím **D**): nhập username TikTok, giả lập comment/quà, chọn camera, chọn giọng đọc, chỉnh âm lượng. **Ẩn bảng này trước khi live** (bấm lại nút ⚙, hoặc mở `?dev=0`)
- Phím **H**: ẩn/hiện toàn bộ khung chữ
- Camera: **0** tự động đổi góc (mặc định) · **1** dọc phố · **2** gần bàn · **3** quay quanh · **4** từ cao · **5** nhà cao + tháp Eiffel · **6** bám theo bàn vừa gọi món
- Có thể đặt username qua biến môi trường: `TIKTOK_USER=tenban npm start`

## Cách live

1. Mở trang bằng Chrome, bấm BẮT ĐẦU, rồi dùng **TikTok LIVE Studio** hoặc **OBS** thu cửa sổ/trình duyệt đó (chọn thu cả âm thanh).
2. Bấm **H** để ẩn khung hướng dẫn nếu muốn gọn màn hình.
3. Màn hình dọc (điện thoại) tự đổi góc nhìn rộng hơn.

> Phần đọc sự kiện live dùng thư viện không chính thức `tiktok-live-connector`, chỉ chạy khi tài khoản đang live. TikTok đổi hệ thống thì thư viện có thể cần cập nhật (`npm update tiktok-live-connector`).

## Luật quán (chỉnh trong `public/js/config.js`)

| Việc | Cách làm |
|---|---|
| Vào bàn | Comment **số ghế 1–80** (hoặc `bàn 7`). Ghế có người → nhân viên báo. Bàn full → báo "bàn full", comment khác không nhận |
| Gọi món | Chỉ người **đang ngồi**. Người chưa vào bàn comment/thả quà đều không được nhận |
| Miễn phí | Mỗi người **2 bia** (comment `bia`, `2 bia`…), mỗi bàn **1 đĩa lạc** (comment `lạc`) |
| Gọi thêm | Thả quà theo mốc: bia 1 xu · lạc 5 · đậu nướng mỡ hành 10 · thịt bò 30 · lẩu bò 99 |
| Quá 2 phút chỉ uống free | Chủ quán ra nói *"Anh em thông cảm, không order thì mời anh em đứng ngoài kia xem nhé!"* và khách xuống đứng vỉa hè |
| Khách đã thả quà | Được ngồi đến khi không hoạt động 15 phút |

Người xem chưa vào bàn đứng ở vỉa hè đối diện. Có thêm người đi đường, chó xin ăn, bán hàng rong, xe ôm, xe cộ.

## Giọng đọc

Khi chưa có file voice, quán đọc bằng giọng máy tiếng Việt. Mặc định chọn giọng nam **Microsoft NamMinh Online (Natural)**. Giọng "Online (Natural)" (NamMinh, HoaiMy) chỉ có khi mở bằng **Microsoft Edge**, Chrome thường chỉ có giọng cũ khó nghe. Đổi giọng trong bảng điều khiển → *Giọng đọc* → *Thử giọng*.

## Âm thanh – bỏ file của bạn vào `public/audio/`

Không có file thì app tự tạo tiếng xe/tiếng nhậu và đọc bằng giọng máy tiếng Việt. Có file thì dùng file (mp3/wav/ogg/m4a, tên bắt đầu bằng tiền tố bên dưới, thêm số tuỳ ý: `hangrong1.mp3`, `hangrong2.mp3`…, app chọn ngẫu nhiên).

- `bgm/` – nhạc nền quán, bỏ bao nhiêu bài cũng được (phát ngẫu nhiên, lặp).
- `sfx/` – `traffic*` (tiếng phố, lặp), `crowd_low*` / `crowd_mid*` / `crowd_high*` (tiếng nhậu xì xào, tự trộn theo độ đông), `horn*`, `clink*` (cụng ly), `dog*` (chó sủa).
- `voice/` –
  - `hangrong*` giọng bán hàng rong, `xeom*` giọng xe ôm
  - `khach_bia*` ("Một bia em ơi!"), `nhanvien_bia*` ("1 bia bàn số …"), `nhanvien_mang_bia*`
  - `khach_mon*`, `nhanvien_nhan_mon*`, `nhanvien_mang_mon*`
  - `nhanvien_moi_ngoi*`, `nhanvien_ban_full*`, `nhanvien_ghe_co_nguoi*`, `nhanvien_het_bia_free*`, `nhanvien_can_qua*`, `nhanvien_cam_on*`
  - `chuquan_moi_xuong*` (câu chủ quán mời khách xuống)
  - Muốn đọc đúng số bàn: thêm đuôi `_ban7`, ví dụ `nhanvien_bia_ban7.mp3`.

## Kiểm thử

```bash
npm test
```
