# MONARCH / SYSTEM — THE SHADOW CODING AGENT

<p align="center">
  <img src="../../assets/logo.svg" alt="Monarch Logo" width="400"/>
</p>

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/Stellarhold170NT/monarch?color=8b0000&labelColor=black&logo=github&style=flat-square)](https://github.com/Stellarhold170NT/monarch/releases)
[![GitHub Stars](https://img.shields.io/github/stars/Stellarhold170NT/monarch?color=ffcb47&labelColor=black&style=flat-square)](https://github.com/Stellarhold170NT/monarch/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/Stellarhold170NT/monarch?color=8ae8ff&labelColor=black&style=flat-square)](https://github.com/Stellarhold170NT/monarch/network/members)
[![License](https://img.shields.io/badge/license-MIT-white?labelColor=black&style=flat-square)](https://github.com/Stellarhold170NT/monarch/blob/main/LICENSE)

</div>

<p align="center">
  <a href="../../README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="README.ja-JP.md">日本語</a> |
  <a href="README.ko-KR.md">한국어</a> |
  <a href="README.vi-VN.md">Tiếng Việt</a>
</p>

Hệ thống AI Agent tiên tiến, kiểm soát tuyệt đối codebase, mang đến quy trình làm việc nhanh chóng — bạn ra lệnh, codebase thích ứng.

> Đừng thuê những mô hình đắt đỏ, đơn lẻ. Lấy cảm hứng từ *Solo Leveling*, **Monarch** là quyền lực tuyệt đối.
>
> Bạn không cần một hệ thống khổng lồ; bạn cần một **Đội quân Bóng tối** gồm các agent chuyên biệt, phục tùng mệnh lệnh của bạn.
>
> Chỉ một lệnh duy nhất từ terminal, và toàn bộ hệ sinh thái mã nguồn mở sẽ dàn trận để chinh phục codebase của bạn.

---

## Trạng thái kích hoạt

| Trạng thái | Mô tả |
|-------|-------------|
| **Monarch** | Kiểm soát toàn bộ repository. Bạn đưa ra ý đồ cấp cao; Monarch điều phối đường đi. |
| **Ruler** | Áp đặt kiến trúc code nghiêm ngặt, quy tắc thiết kế hệ thống và tách rời sạch sẽ. |
| **System** | Phân rã yêu cầu phức tạp thành các tác vụ nguyên tử và tự động điều khiển thực thi. |
| **Quicksilver** | Công cụ thực thi tốc độ cao, tối ưu context window và luồng token với độ trễ tối thiểu. |

---

## Đội quân Bóng tối (Sub-Agent)

| Agent | Vai trò | Hồ sơ |
|-------|------|---------|
| **Igris** | Kiến trúc sư | Tập trung vào độ chính xác, xác thực logic nghiêm ngặt và tái cấu trúc sạch sẽ. |
| **Beru** | Tự phục hồi | Giám sát thực thi runtime, quét log lỗi và tự động sửa bugs. |
| **Greed** | Công cụ thanh lọc | Xóa bỏ dead code, boilerplate và nợ kỹ thuật không thương tiếc. |

---

## Tích hợp OpenCode

Monarch có thể được dùng như một plugin OpenCode. Thêm vào `opencode.json` của dự án:

### Qua Git (khuyên dùng)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "monarch@git+https://github.com/Stellarhold170NT/monarch.git"
  ]
}
```

### Qua đường dẫn local (cho phát triển)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "../monarch"
  ]
}
```

Tạo hoặc sửa file `opencode.json` trong thư mục gốc dự án, sau đó khởi động lại OpenCode. Các agent của Monarch (Igris, Beru, Greed) và tất cả kỹ năng sẽ được tự động đăng ký.
