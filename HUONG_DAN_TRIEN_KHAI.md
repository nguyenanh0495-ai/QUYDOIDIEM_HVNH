# Hướng dẫn triển khai — Hệ thống đăng ký quy đổi học phần

Toàn bộ hệ thống gồm 2 phần:

| Thành phần | Nơi đặt | Vai trò |
|---|---|---|
| `index.html` | GitHub Pages (repo QUYDOIDIEM_HVNH) | Trang sinh viên nhập liệu |
| `Code.gs` | Google Apps Script | Nhận dữ liệu → ghi Google Trang tính → lưu Drive → gửi email |

Làm theo đúng thứ tự 5 bước dưới đây.

---

## Bước 1 — Tạo Google Trang tính

1. Vào https://sheets.new, đặt tên ví dụ **"QUY ĐỔI HỌC PHẦN - Dữ liệu đăng ký"**.
2. Sao chép **ID bảng tính** trên thanh địa chỉ — là đoạn nằm giữa `/d/` và `/edit`:

```
https://docs.google.com/spreadsheets/d/1AbCdEfGh...XyZ/edit
                                       └──── ID ────┘
```

> Không cần tự tạo sheet hay tiêu đề cột — script sẽ tự tạo sheet `DangKy` và dòng tiêu đề ở lần chạy đầu.

---

## Bước 2 — Cài Apps Script

1. Trong bảng tính vừa tạo: **Tiện ích mở rộng → Apps Script**.
2. Xoá hết code mẫu, dán toàn bộ nội dung file `Code.gs`.
3. Ở đầu file, sửa phần `CONFIG`:

```js
var CONFIG = {
  SPREADSHEET_ID: "1AbCdEfGh...XyZ",   // ← dán ID ở Bước 1 (hoặc để "" nếu script gắn trong bảng tính)
  SHEET_NAME: "DangKy",
  DRIVE_FOLDER_NAME: "MinhChung_QuyDoiDiem",
  ALLOWED_EMAIL_DOMAIN: "hvnh.edu.vn",
  SEND_CONFIRM_EMAIL: true,
  CC_EMAIL: "nguyenanh0495@gmail.com",  // ← email của thầy/cô, nhận bản sao mỗi hồ sơ (để "" nếu không cần)
  MAX_FILE_MB: 10,
  MAX_PAIRS: 30
};
```

4. Lưu (Ctrl+S), chọn hàm **`khoiTao`** ở thanh trên rồi bấm **Chạy**.
   - Google sẽ hỏi quyền: **Xem lại quyền → chọn tài khoản → Nâng cao → Chuyển đến … (không an toàn) → Cho phép**.
   - Đây là bước bắt buộc, chỉ làm một lần. Chạy xong, mở lại bảng tính sẽ thấy sheet `DangKy` với đủ tiêu đề cột.

---

## Bước 3 — Triển khai Web App

1. Trong Apps Script: **Triển khai → Tuỳ chọn triển khai mới**.
2. Bấm biểu tượng bánh răng cạnh "Chọn loại" → chọn **Ứng dụng web**.
3. Thiết lập:

| Mục | Giá trị |
|---|---|
| Mô tả | Quy đổi học phần v1 |
| Thực thi với tư cách | **Tôi** (`nguyenanh0495@gmail.com`) |
| Ai có quyền truy cập | **Bất kỳ ai** |

> ⚠️ Phải chọn **"Bất kỳ ai"** (không phải "Bất kỳ ai có tài khoản Google"), nếu không trang web sẽ báo lỗi kết nối.

4. Bấm **Triển khai**, sao chép **URL ứng dụng web** (kết thúc bằng `/exec`).

---

## Bước 4 — Cập nhật trang web

Mở `index.html`, tìm dòng gần đầu khối `<script>`:

```js
const WEB_APP_URL = "https://script.google.com/macros/s/..../exec";
```

Thay bằng URL vừa sao chép ở Bước 3, **lưu file lại**, rồi đưa lên GitHub theo một trong hai cách:

### Cách A — Dùng trình duyệt (không cần cài Git, khuyên dùng)

1. Mở https://github.com/nguyenanh0495-ai/QUYDOIDIEM_HVNH
2. Bấm **Add file → Upload files**.
3. Kéo thả cả 3 file `index.html`, `Code.gs`, `HUONG_DAN_TRIEN_KHAI.md` từ thư mục trên máy vào khung upload.
   - GitHub sẽ tự ghi đè `index.html` cũ — đúng như mong muốn.
4. Ô "Commit changes": gõ `Hoàn thiện form quy đổi: gửi đủ dữ liệu, upload minh chứng, email xác nhận`
5. Bấm **Commit changes**. Đợi 1–2 phút để GitHub Pages cập nhật.

### Cách B — Dùng Git trên máy

```bash
git clone https://github.com/nguyenanh0495-ai/QUYDOIDIEM_HVNH.git
# chép 3 file vào thư mục vừa clone, rồi:
git add index.html Code.gs HUONG_DAN_TRIEN_KHAI.md
git commit -m "Hoàn thiện form quy đổi: gửi đủ dữ liệu, upload minh chứng, email xác nhận"
git push
```

Bật GitHub Pages nếu chưa có: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
Trang sẽ chạy tại `https://nguyenanh0495-ai.github.io/QUYDOIDIEM_HVNH/`.

> 💡 Sau khi upload, mở trang bằng **Ctrl+F5** (tải lại bỏ cache) để chắc chắn thấy bản mới.

---

## Bước 5 — Kiểm tra thực tế

1. Mở trang, điền thử một hồ sơ bằng email `@hvnh.edu.vn`, đính kèm 1 file PDF.
2. Kết quả đúng phải là: trang hiện **mã hồ sơ** dạng `QD-401234-260908-101500`.
3. Kiểm tra bảng tính có dòng mới, thư mục Drive `MinhChung_QuyDoiDiem` có file, và hộp thư nhận được email xác nhận.

---

## Cấu trúc dữ liệu trong bảng tính

Mỗi **học phần nguồn** là một dòng. Một hồ sơ có 2 dòng quy đổi, trong đó dòng 1 gộp 2 môn → tổng cộng 3 dòng, tất cả cùng **Mã hồ sơ**.

| Cột | Ý nghĩa |
|---|---|
| Mã hồ sơ | Khoá nhóm các dòng của cùng một hồ sơ |
| Thời gian gửi | Dấu thời gian tự động |
| Email / Mã SV / Họ tên | Thông tin sinh viên (lặp lại ở mọi dòng) |
| Hình thức quy đổi / Cơ sở đào tạo cũ | Theo lựa chọn trên form |
| STT cặp | Dòng quy đổi thứ mấy trong hồ sơ |
| STT HP nguồn / Số HP nguồn gộp | Vị trí môn trong nhóm gộp và tổng số môn gộp |
| Tên HP nguồn / Số TC / Điểm nguồn | Môn sinh viên đã học |
| Mã, Tên, Số TC, Điểm HP đích | Học phần tương ứng tại HVNH |
| File minh chứng | Link Drive, chỉ ghi ở dòng đầu của hồ sơ |
| Trạng thái xử lý | Mặc định "Chờ duyệt" — thầy/cô sửa tay khi xét |
| Ghi chú của giảng viên | Cột trống để nhập tay |

Cấu trúc này lọc và tổng hợp rất thuận tiện, ví dụ đếm số hồ sơ chờ duyệt:

```
=COUNTIF(DangKy!S:S; "Chờ duyệt")
```

hoặc lấy toàn bộ dòng của một sinh viên:

```
=FILTER(DangKy!A:T; DangKy!D:D = "24A4011234")
```

---

## Những điểm cần lưu ý

- **Mỗi lần sửa `Code.gs`** phải vào **Triển khai → Quản lý các bản triển khai → biểu tượng bút chì → Phiên bản: Phiên bản mới → Triển khai**. Nếu tạo bản triển khai mới hoàn toàn thì URL sẽ đổi và phải cập nhật lại `index.html`.
- **Hạn mức gửi email**: tài khoản Gmail thường được 100 email/ngày, tài khoản Google Workspace của trường được 1.500/ngày. Nếu vượt hạn mức, hồ sơ **vẫn được ghi vào bảng tính**, chỉ email xác nhận là không gửi được.
- **File minh chứng** được đặt chế độ "bất kỳ ai có link đều xem được" để thầy/cô mở nhanh từ bảng tính. Nếu muốn siết lại, sửa dòng `file.setSharing(...)` trong `Code.gs` thành `DriveApp.Access.PRIVATE`.
- **Bảo mật**: form là công khai, ai có link đều gửi được (chỉ chặn ở mức đuôi email). Nếu cần xác thực thật sự bằng tài khoản Google của trường, phải chuyển sang Google Form hoặc đặt quyền web app là "Bất kỳ ai trong Học viện Ngân hàng" — khi đó sinh viên phải đăng nhập email trường trước khi gửi.
- **Sao lưu**: nên bật **Tệp → Lịch sử phiên bản** và định kỳ tải bản sao bảng tính.
