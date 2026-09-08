/**
 * HỆ THỐNG ĐĂNG KÝ QUY ĐỔI HỌC PHẦN - HỌC VIỆN NGÂN HÀNG
 * Google Apps Script backend: nhận dữ liệu từ trang web (GitHub Pages),
 * ghi vào Google Trang tính, lưu file minh chứng lên Drive, gửi email xác nhận.
 *
 * CÁCH DÙNG: xem file HUONG_DAN_TRIEN_KHAI.md
 */

// ====================== CẤU HÌNH ======================
var CONFIG = {
  // Dán ID của Google Trang tính vào đây (phần giữa /d/ và /edit trên URL).
  // Để trống "" nếu script được gắn trực tiếp vào bảng tính (Extensions > Apps Script).
  SPREADSHEET_ID: "",

  SHEET_NAME: "DangKy",              // tên sheet lưu dữ liệu
  DRIVE_FOLDER_NAME: "MinhChung_QuyDoiDiem", // thư mục Drive lưu file minh chứng

  ALLOWED_EMAIL_DOMAIN: "hvnh.edu.vn", // chỉ nhận email đuôi này ("" = bỏ kiểm tra)
  SEND_CONFIRM_EMAIL: true,            // gửi email xác nhận cho sinh viên
  CC_EMAIL: "nguyenanh0495@gmail.com", // email giảng viên nhận bản sao (tuỳ chọn)

  MAX_FILE_MB: 10,                     // giới hạn dung lượng mỗi file minh chứng
  MAX_PAIRS: 30                        // số cặp quy đổi tối đa mỗi hồ sơ
};

var HEADERS = [
  "Mã hồ sơ", "Thời gian gửi", "Email sinh viên", "Mã sinh viên", "Họ và tên",
  "Hình thức quy đổi", "Cơ sở đào tạo cũ",
  "STT cặp", "STT HP nguồn", "Số HP nguồn gộp",
  "Tên HP nguồn", "Số TC nguồn", "Điểm nguồn",
  "Mã HP đích", "Tên HP đích", "Số TC đích", "Điểm đích",
  "File minh chứng", "Trạng thái xử lý", "Ghi chú của giảng viên"
];

var TRANSFER_TYPE_LABEL = {
  hvnh: "Quy đổi từ kết quả học tập tại Học viện Ngân hàng",
  other: "Quy đổi từ kết quả học tập tại cơ sở đào tạo khác",
  gdqp: "Quy đổi từ chứng chỉ GDQP",
  professional: "Quy đổi từ chứng chỉ nghề nghiệp"
};

// ====================== ĐIỂM VÀO ======================

function doGet(e) {
  return jsonOut({ ok: true, message: "Web app đang hoạt động." });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return jsonOut({ ok: false, message: "Hệ thống đang bận, vui lòng gửi lại sau ít giây." });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ ok: false, message: "Không nhận được dữ liệu." });
    }

    var data = JSON.parse(e.postData.contents);
    var check = validate(data);
    if (!check.ok) return jsonOut(check);

    var maHoSo = taoMaHoSo(data.studentId);
    var now = new Date();

    // 1) Lưu file minh chứng (nếu có)
    var fileLinks = luuFileMinhChung(data.files, data.studentId, maHoSo);

    // 2) Ghi vào bảng tính: mỗi học phần nguồn một dòng
    var sheet = laySheet();
    var rows = dungCacDong(data, maHoSo, now, fileLinks.join("\n"));
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    sheet.autoResizeColumns(1, 7);

    // 3) Gửi email xác nhận
    if (CONFIG.SEND_CONFIRM_EMAIL) {
      try {
        guiEmailXacNhan(data, maHoSo, now, fileLinks);
      } catch (mailErr) {
        // Không chặn quy trình nếu hết quota gửi mail
        console.error("Lỗi gửi email: " + mailErr);
      }
    }

    return jsonOut({
      ok: true,
      maHoSo: maHoSo,
      soDong: rows.length,
      message: "Đã tiếp nhận hồ sơ."
    });

  } catch (err) {
    console.error(err);
    return jsonOut({ ok: false, message: "Lỗi máy chủ: " + err.message });
  } finally {
    lock.releaseLock();
  }
}

// ====================== KIỂM TRA DỮ LIỆU ======================

function validate(d) {
  if (!d.email || !d.studentId || !d.fullName) {
    return { ok: false, message: "Thiếu email, mã sinh viên hoặc họ tên." };
  }
  var email = String(d.email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, message: "Email không hợp lệ." };
  }
  if (CONFIG.ALLOWED_EMAIL_DOMAIN &&
      email.slice(-(CONFIG.ALLOWED_EMAIL_DOMAIN.length + 1)) !== "@" + CONFIG.ALLOWED_EMAIL_DOMAIN) {
    return { ok: false, message: "Chỉ chấp nhận email @" + CONFIG.ALLOWED_EMAIL_DOMAIN };
  }
  if (!d.transferType || !TRANSFER_TYPE_LABEL[d.transferType]) {
    return { ok: false, message: "Chưa chọn hình thức quy đổi hợp lệ." };
  }
  if (d.transferType === "other" && !String(d.oldInstitution || "").trim()) {
    return { ok: false, message: "Vui lòng nhập tên cơ sở đào tạo cũ." };
  }
  if (!Array.isArray(d.pairs) || d.pairs.length === 0) {
    return { ok: false, message: "Chưa có học phần quy đổi nào." };
  }
  if (d.pairs.length > CONFIG.MAX_PAIRS) {
    return { ok: false, message: "Tối đa " + CONFIG.MAX_PAIRS + " dòng quy đổi mỗi hồ sơ." };
  }
  for (var i = 0; i < d.pairs.length; i++) {
    var p = d.pairs[i];
    if (!p.sources || !p.sources.length || !p.target) {
      return { ok: false, message: "Dòng quy đổi " + (i + 1) + " chưa đầy đủ." };
    }
    if (!String(p.target.name || "").trim()) {
      return { ok: false, message: "Dòng quy đổi " + (i + 1) + ": thiếu tên học phần đích." };
    }
    for (var j = 0; j < p.sources.length; j++) {
      if (!String(p.sources[j].name || "").trim()) {
        return { ok: false, message: "Dòng quy đổi " + (i + 1) + ": thiếu tên học phần nguồn." };
      }
    }
  }
  return { ok: true };
}

// ====================== GHI DỮ LIỆU ======================

function dungCacDong(d, maHoSo, now, fileLinkText) {
  var rows = [];
  var loai = TRANSFER_TYPE_LABEL[d.transferType] || d.transferType;
  var coSoCu = d.transferType === "other" ? String(d.oldInstitution || "").trim() : "";

  d.pairs.forEach(function (p, iPair) {
    var t = p.target || {};
    p.sources.forEach(function (s, iSrc) {
      rows.push([
        maHoSo,
        now,
        String(d.email).trim(),
        String(d.studentId).trim().toUpperCase(),
        String(d.fullName).trim(),
        loai,
        coSoCu,
        iPair + 1,
        iSrc + 1,
        p.sources.length,
        String(s.name || "").trim(),
        s.credit || "",
        s.grade || "",
        String(t.code || "").trim().toUpperCase(),
        String(t.name || "").trim(),
        t.credit || "",
        t.grade || "",
        iSrc === 0 ? fileLinkText : "",
        iSrc === 0 ? "Chờ duyệt" : "",
        ""
      ]);
    });
  });
  return rows;
}

function laySheet() {
  var ss = CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Không mở được bảng tính. Hãy điền SPREADSHEET_ID trong CONFIG.");

  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight("bold")
      .setBackground("#003366")
      .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.getRange(2, 2, sheet.getMaxRows() - 1, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  }
  return sheet;
}

// ====================== FILE MINH CHỨNG ======================

function luuFileMinhChung(files, studentId, maHoSo) {
  if (!files || !files.length) return [];

  var root = layThuMuc(CONFIG.DRIVE_FOLDER_NAME, DriveApp.getRootFolder());
  var sub = layThuMuc(String(studentId).trim().toUpperCase() + "_" + maHoSo, root);

  var links = [];
  files.forEach(function (f, idx) {
    if (!f || !f.data) return;
    var bytes = Utilities.base64Decode(f.data);
    if (bytes.length > CONFIG.MAX_FILE_MB * 1024 * 1024) {
      throw new Error("File \"" + f.name + "\" vượt quá " + CONFIG.MAX_FILE_MB + "MB.");
    }
    var blob = Utilities.newBlob(bytes, f.type || "application/octet-stream",
      (idx + 1) + "_" + (f.name || "minhchung"));
    var file = sub.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    links.push(file.getUrl());
  });
  return links;
}

function layThuMuc(name, parent) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ====================== EMAIL XÁC NHẬN ======================

function guiEmailXacNhan(d, maHoSo, now, fileLinks) {
  var dsHocPhan = d.pairs.map(function (p, i) {
    var src = p.sources.map(function (s) {
      return "&bull; " + esc(s.name) + " (" + esc(s.credit) + " TC, điểm " + esc(s.grade) + ")";
    }).join("<br>");
    var t = p.target || {};
    return "<tr>" +
      "<td style='border:1px solid #ccc;padding:8px;text-align:center'>" + (i + 1) + "</td>" +
      "<td style='border:1px solid #ccc;padding:8px'>" + src + "</td>" +
      "<td style='border:1px solid #ccc;padding:8px'>" + esc(t.code) + " - " + esc(t.name) +
      " (" + esc(t.credit) + " TC, điểm " + esc(t.grade) + ")</td>" +
      "</tr>";
  }).join("");

  var html =
    "<div style=\"font-family:Arial,sans-serif;font-size:14px;color:#222\">" +
    "<h2 style='color:#003366'>Xác nhận tiếp nhận hồ sơ quy đổi học phần</h2>" +
    "<p>Chào <b>" + esc(d.fullName) + "</b>,</p>" +
    "<p>Hệ thống đã tiếp nhận hồ sơ đăng ký quy đổi học phần của bạn.</p>" +
    "<table style='border-collapse:collapse'>" +
    "<tr><td style='padding:4px 12px 4px 0'><b>Mã hồ sơ:</b></td><td>" + maHoSo + "</td></tr>" +
    "<tr><td style='padding:4px 12px 4px 0'><b>Mã sinh viên:</b></td><td>" + esc(d.studentId) + "</td></tr>" +
    "<tr><td style='padding:4px 12px 4px 0'><b>Hình thức:</b></td><td>" +
      esc(TRANSFER_TYPE_LABEL[d.transferType]) + "</td></tr>" +
    "<tr><td style='padding:4px 12px 4px 0'><b>Thời gian gửi:</b></td><td>" +
      Utilities.formatDate(now, "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm") + "</td></tr>" +
    "</table>" +
    "<h3 style='color:#003366'>Nội dung đề xuất quy đổi</h3>" +
    "<table style='border-collapse:collapse;border:1px solid #ccc'>" +
    "<tr style='background:#f0f4f8'>" +
    "<th style='border:1px solid #ccc;padding:8px'>STT</th>" +
    "<th style='border:1px solid #ccc;padding:8px'>Học phần nguồn (đã học)</th>" +
    "<th style='border:1px solid #ccc;padding:8px'>Học phần đích (HVNH)</th></tr>" +
    dsHocPhan + "</table>" +
    (fileLinks.length ? "<p><b>Minh chứng đã nộp:</b> " + fileLinks.length + " file</p>" : "") +
    "<p style='margin-top:20px'>Vui lòng lưu lại mã hồ sơ để tra cứu. " +
    "Đây là email tự động, bạn không cần trả lời.</p></div>";

  var options = { htmlBody: html, name: "Hệ thống Quy đổi Học phần - HVNH" };
  if (CONFIG.CC_EMAIL) options.cc = CONFIG.CC_EMAIL;

  MailApp.sendEmail(String(d.email).trim(),
    "[HVNH] Xác nhận hồ sơ quy đổi học phần - " + maHoSo, "", options);
}

// ====================== TIỆN ÍCH ======================

function taoMaHoSo(studentId) {
  var stamp = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "yyMMdd-HHmmss");
  var sid = String(studentId || "SV").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-6);
  return "QD-" + sid + "-" + stamp;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Chạy thử một lần trong trình soạn thảo để cấp quyền và tạo sheet. */
function khoiTao() {
  var sheet = laySheet();
  Logger.log("Sheet sẵn sàng: " + sheet.getName());
  Logger.log("Tài khoản: " + Session.getEffectiveUser().getEmail());
}
