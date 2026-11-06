# Rà soát OmniMail — 05/11/2026

## Cập nhật khắc phục trong workspace

Hai mục ưu tiên 1–2 bên dưới đã được sửa trong code local ngày 05/11/2026; chưa deploy production. Các phần còn lại giữ nguyên kết quả audit ban đầu.

- Rate limit: thêm `request-limits.ts`, cấu hình `TRUST_PROXY_HOPS` (Render: 1; truy cập trực tiếp: 0), giữ khóa IP/IPv6 mặc định của thư viện, loại GET/HEAD health check khỏi quota và trả JSON 429 với `Retry-After`.
- Dependency: cập nhật các gói trực tiếp và override có phạm vi cho dependency gián tiếp. `pnpm audit --prod`: **0 cảnh báo**, giảm từ 45. `pnpm audit` toàn bộ, gồm công cụ phát triển: **0 cảnh báo**.
- Vitest nâng lên 4.1.12 để nhận bản vá; test scripts giới hạn `--dir src` để không chạy trùng test đã biên dịch trong `dist`.
- Kiểm chứng: **134/134 test đạt** (82 API + 52 web), gồm 14 trường hợp mới cho proxy/rate limit; typecheck, build và cài đặt `--frozen-lockfile` đạt. Khởi tạo Firebase Admin/Firestore offline và phân tích MIME bằng mailparser thật cũng đạt.
- Cấu hình Render dùng một proxy tin cậy theo hướng dẫn nhà cung cấp. Khi deploy cần xác nhận cấu hình môi trường và chuỗi proxy thực tế; không tái hiện giới hạn bằng cách tạo tải lớn lên website thật.

## Báo cáo ban đầu

Phạm vi: code tại commit `dc16236`, build/test local, HTTP production và thao tác đọc trên https://omnimail.io.vn/. Kiểm tra khoảng 09:01–09:07, giờ Việt Nam. Không thay đổi logic ứng dụng, dependency hoặc triển khai production.

## Kết quả thực tế

- Trang chủ, `/login`, `/privacy`, `/security`: HTTP 200. HTTP chuyển hướng 301 sang HTTPS.
- `/api/health`: 200, production, persistent mailbox storage bật. API báo revision `dc162361ad8f678ff2ee2af5c7e0bba08a1fdce1`, trùng HEAD local.
- Tên asset JS/CSS chính trên production trùng tên asset build local. Đây là đối chiếu tên asset, không phải kiểm chứng toàn bộ nội dung deployment.
- CORS cho `https://omnimail.io.vn` hoạt động. `/api/me` không có token trả 401 đúng yêu cầu.
- Phiên đăng nhập có sẵn được khôi phục. Đã mở Home, Mailboxes, Connect, Temp Mail, Sharing; một Gmail và một Outlook mẫu tải được danh sách, một thư Outlook mở được nội dung.
- Temp Mail hiện trạng thái chờ thư, chưa kiểm chứng nhận thư mới. Trang Sharing mở được; chưa thử cấp/thu hồi quyền.
- Không thấy lỗi console ở các thời điểm đã đọc log. Bố cục Mailboxes ở chiều rộng khoảng 362 px không bị tràn ngang toàn trang.
- `pnpm build`: đạt. `pnpm typecheck`: đạt. `pnpm test`: 120/120 đạt (68 API, 52 web).

## Phát hiện cần xử lý

### 1. P1 — Rate limit nhận diện IP proxy thay vì IP người dùng

Vị trí: `apps/api/src/app.ts:80–102`.

Express không cấu hình `trust proxy`, nhưng middleware giới hạn 240 request/phút dùng khóa IP mặc định. Khi nhiều người dùng đi qua cùng địa chỉ proxy, họ có thể dùng chung quota và bị 429 dù từng người dùng chưa vượt giới hạn. Middleware này cũng áp dụng lên health check.

Đã tái hiện local bằng Supertest trên build hiện tại, không nạp `.env`: `app.get('trust proxy')` trả `false`; hai request với `X-Forwarded-For` lần lượt `192.0.2.10` và `198.51.100.20` dùng chung bộ đếm 239 → 238. Thư viện in `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`. Không gửi lượng lớn request để cố tạo 429 trên production; mức độ ảnh hưởng thực tế còn phụ thuộc topology proxy Render.

Hướng sửa: xác minh chuỗi proxy thực tế và chỉ tin cậy proxy/hop phù hợp; không bật `trust proxy: true` vô điều kiện. Tách health check khỏi quota ứng dụng; cân nhắc quota theo UID cho các route đã xác thực.

Nguồn: https://express-rate-limit.mintlify.app/reference/error-codes#err-erl-unexpected-x-forwarded-for

### 2. P1 — Dependency production có cảnh báo bảo mật cần phân loại và cập nhật

`pnpm audit --prod --json` báo **45 cảnh báo: 2 critical, 13 high, 25 moderate, 5 low** tại thời điểm kiểm tra. Đây là kết quả theo phiên bản dependency, không có nghĩa mọi cảnh báo đều khai thác được trong ứng dụng này.

Các gói đáng chú ý trong `pnpm-lock.yaml`:

| Gói | Phiên bản khóa | Phát hiện / hướng xử lý |
| --- | --- | --- |
| engine.io | 6.6.9 | High: protocol revision mismatch DoS; bản vá từ 6.6.10. API khởi tạo Socket.IO với transport upgrade mặc định, nên cần ưu tiên đánh giá và nâng cấp. |
| body-parser | 2.3.0 | High: DoS qua dữ liệu nén; audit đề xuất từ 2.4.0. API có `express.json()`. |
| nodemailer | 9.0.3 | High: xử lý địa chỉ có độ phức tạp bậc hai; xuất hiện trong chuỗi dependency xử lý mail. |
| proxy-addr | 2.0.7 | Critical: giả mạo IP trong cấu hình subnet IPv4-mapped IPv6; bản vá từ 2.0.8. Cấu hình hiện tại chưa bật trust proxy, nên không kết luận đang khai thác được. |
| dompurify | 3.4.14 | Critical/high; bản vá từ 3.4.17. Advisory critical yêu cầu SAFE_FOR_TEMPLATES và chế độ DOM output; code hiện gọi `DOMPurify.sanitize(html)` trả chuỗi nên chưa xác nhận có đường khai thác tương ứng. |

Nguồn đối chiếu:
- https://github.com/advisories/GHSA-2gc4-cqfq-p2gv
- https://github.com/advisories/GHSA-cg2g-xh64-v4q7
- Các URL advisory còn lại được cung cấp bởi `pnpm audit`.

### 3. P2 — Polling hộp thư bỏ qua cache đồng bộ, tạo tải dư thừa

Vị trí: `apps/web/src/MailApp.tsx:160–167`, `apps/api/src/app.ts:457–458`.

Frontend gửi `limit=250&refresh=1` mỗi 5 giây. Backend chủ động bỏ qua cache từ scheduler khi có `refresh=1`; do đó mỗi chu kỳ vẫn gọi adapter nhà cung cấp. Các adapter có cache nội bộ nhưng Gmail/Microsoft vẫn kiểm tra danh sách từ provider; Gmail App Password mở kết nối IMAP mới. Mỗi tab đang hoạt động tạo khoảng 12 lần tải danh sách/phút, chưa tính request từ socket invalidation, tìm kiếm và đồng bộ thủ công.

Trên production đã quan sát một Gmail hiển thị 199 thư chính, khác mô tả “10 thư mới nhất” trong README. Không mặc định coi 199 thư là lỗi yêu cầu sản phẩm, nhưng cần thống nhất giới hạn và cơ chế tải. Chưa đo CPU/quota provider nên đây là rủi ro hiệu năng xác định từ code, không phải kết luận nguyên nhân của một outage.

Hướng sửa: tách refresh thủ công khỏi polling; dùng cache có TTL hoặc cập nhật gia tăng, điều phối request dùng chung theo mailbox, tận dụng sự kiện socket. Quyết định rõ số lượng thư và phân trang.

### 4. P2 — Lỗi tải chi tiết thư bị biến thành trạng thái chưa chọn thư

Vị trí: `apps/web/src/MailApp.tsx:182–185`, `403–413`; tương tự query chi tiết Temp Mail tại dòng 719.

Query chi tiết chỉ lấy `data`, không lấy `isPending/error/refetch`. Khi đã chọn thư nhưng request còn chờ hoặc thất bại, vùng chi tiết vẫn rơi vào `Select a message`. Người dùng không biết đang tải, lỗi quyền truy cập hay lỗi provider và không có nút thử lại riêng. Trên mobile, điều này có thể trông như nhấn thư không phản hồi.

Hướng sửa: hiển thị trạng thái dựa trên ID đã chọn, loading và error; cung cấp retry. Trong lần kiểm tra production, thư mẫu tải thành công; nhánh lỗi được xác định bằng đọc code, chưa cưỡng bức lỗi provider trên hệ thống thật.

### 5. P2 — Đồng bộ có thể kết thúc giao diện khi job vẫn chạy; lỗi thao tác không hiển thị

Vị trí: `apps/web/src/MailApp.tsx:196–209`, `340–355`.

Sau tối đa 80 lượt polling cách nhau 750 ms, hàm chỉ throw nếu trạng thái là `failed`; nếu vẫn `queued/running`, nó vẫn return và chạy `onSuccess`, dừng trạng thái pending của nút. Thời gian tổng còn cộng thời gian request, không phải timeout cứng 60 giây. Ngoài ra `syncAccount.error` và `removeAccount.error` không được render, nên lỗi đồng bộ/ngắt kết nối có thể không có phản hồi rõ ràng.

Hướng sửa: chỉ coi `completed` là hoàn tất; nếu hết thời gian chờ thì hiển thị job vẫn đang chạy hoặc trạng thái timeout và cho theo dõi lại. Hiển thị lỗi mutation cạnh nút thao tác. Không kích hoạt ngắt kết nối hay gây lỗi đồng bộ trên production để tái hiện.

## Khoảng trống kiểm chứng

- `test:e2e` hiện chỉ echo thông báo; chưa có bộ E2E thực thi. Script lint dùng `--if-present` nhưng các package đã kiểm tra không có lint script, nên không coi đây là kiểm tra lint thực chất.
- API client và nhiều provider fetch chưa đặt deadline ứng dụng; lúc mạng/provider chậm có thể giữ loading lâu. Cần thiết kế timeout phù hợp với Render cold start và tác vụ dài.
- Chưa thử đăng ký mới, gửi email xác minh/reset password, OAuth cấp quyền mới, đổi role, tạo/xóa mailbox hoặc thao tác chia sẻ. Không kiểm chứng đủ mọi tài khoản/provider bằng một vài mẫu.
- Chưa kiểm tra log Render, dashboard Firebase, hạn mức sử dụng, Firestore rules qua emulator, hay tải đồng thời thực tế. Không kết luận website đã bị xâm nhập từ kết quả dependency audit.

Ưu tiên: sửa cấu hình proxy/rate limit và cập nhật dependency có đường sử dụng phù hợp; sau đó xử lý loading/error và polling; bổ sung E2E cho các luồng này.
