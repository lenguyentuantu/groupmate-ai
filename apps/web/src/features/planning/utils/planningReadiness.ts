import type { ReadinessIssue } from '@/lib/api/endpoints/planning';

const copy: Record<string, { title: string; impact: string; action: string }> = {
  SOURCE_PROJECT_MISMATCH: {
    title: 'Nguồn kế hoạch không thuộc dự án hiện tại',
    impact: 'Không thể xác nhận đường cơ sở từ dữ liệu của dự án khác.',
    action: 'Mở đúng dự án và tạo lại bản xem trước phê duyệt.',
  },
  WBS_INVALID: {
    title: 'WBS chưa hợp lệ',
    impact: 'Cấu trúc công việc chưa đáp ứng điều kiện để triển khai.',
    action: 'Sửa WBS và lưu phiên bản mới trước khi tiếp tục.',
  },
  PROPOSAL_MISSING: {
    title: 'Chưa có đề xuất phân công đã lưu',
    impact: 'Hệ thống chưa có quyết định phân công để tạo đường cơ sở.',
    action: 'Tạo, rà soát và lưu đề xuất phân công.',
  },
  PROPOSAL_DRAFT_MISMATCH: {
    title: 'Đề xuất phân công không thuộc WBS này',
    impact: 'Đề xuất hiện tại không thể dùng cho bản kế hoạch đang mở.',
    action: 'Tạo lại đề xuất từ WBS hiện tại.',
  },
  PROPOSAL_INVALID: {
    title: 'Đề xuất phân công chưa hợp lệ',
    impact: 'Một phần dữ liệu phân công không thể dùng để triển khai.',
    action: 'Kiểm tra lại đề xuất và lưu phiên bản hợp lệ.',
  },
  DEPENDENCY_CYCLE: {
    title: 'Quan hệ phụ thuộc tạo thành vòng lặp',
    impact: 'Các công việc không có thứ tự thực hiện hợp lệ.',
    action: 'Sửa quan hệ phụ thuộc trong WBS.',
  },
  NO_ACTIONABLE_TASKS: {
    title: 'Chưa có công việc có thể triển khai',
    impact: 'Không có Công việc nào sẽ được tạo khi phê duyệt.',
    action: 'Bổ sung công việc có thể thực hiện vào WBS.',
  },
  PROPOSAL_STALE: {
    title: 'Đề xuất phân công đã cũ',
    impact: 'WBS đã thay đổi sau khi đề xuất được tạo.',
    action: 'Kiểm tra lại và lưu đề xuất phân công mới.',
  },
  PUBLISH_COLUMN_MISSING: {
    title: 'Chưa có cột nhận công việc mới',
    impact: 'Hệ thống chưa xác định được nơi tạo Công việc.',
    action: 'Thiết lập cột phù hợp trên bảng dự án.',
  },
  PUBLISH_COLUMN_WIP_LIMIT: {
    title: 'Cột nhận công việc đã đạt giới hạn',
    impact: 'Các Công việc mới không thể được thêm vào cột hiện tại.',
    action: 'Giải phóng giới hạn hoặc chọn cột nhận công việc phù hợp.',
  },
  PROPOSAL_TASK_MISMATCH: {
    title: 'Danh sách công việc và đề xuất không khớp',
    impact: 'Một số công việc không có quyết định phân công tương ứng.',
    action: 'Tạo lại và lưu đề xuất phân công.',
  },
  PROPOSAL_SCHEDULE_MISMATCH: {
    title: 'Lịch thực hiện và WBS không khớp',
    impact: 'Thứ tự thực hiện chưa bao phủ đúng các công việc hiện tại.',
    action: 'Tạo lại và lưu đề xuất phân công.',
  },
  PROVISIONAL_ASSIGNMENT: {
    title: 'Công việc đang giao cho ứng viên tạm thời',
    impact: 'Ứng viên tạm thời không thể trở thành người phụ trách thực tế.',
    action: 'Chọn thành viên hiện tại hoặc giữ công việc chưa phân công.',
  },
  INVALID_ASSIGNEE: {
    title: 'Người phụ trách không còn hợp lệ',
    impact: 'Một số người được chọn không còn là thành viên được phép của dự án.',
    action: 'Chọn lại người phụ trách hiện còn trong dự án.',
  },
  UNASSIGNED_TASKS: {
    title: 'Công việc chưa có người phụ trách',
    impact: 'Những công việc này sẽ được tạo trong backlog để phân công sau.',
    action: 'Xác nhận rủi ro hoặc chọn thành viên dự án.',
  },
  MISSING_SKILLS: {
    title: 'Thiếu bằng chứng kỹ năng',
    impact: 'Hồ sơ của người phụ trách chưa bao phủ mọi kỹ năng yêu cầu.',
    action: 'Rà soát phân công hoặc cập nhật kỹ năng đã xác minh.',
  },
  UNKNOWN_ESTIMATES: {
    title: 'Công việc chưa có ước tính',
    impact: 'Tổng công sức hiện tại chỉ là một phần của kế hoạch.',
    action: 'Bổ sung ước tính trước khi cam kết thời hạn.',
  },
  UNKNOWN_CAPACITY: {
    title: 'Chưa biết thời gian khả dụng của thành viên',
    impact: 'Chưa thể kết luận nguồn lực có đáp ứng kế hoạch hay không.',
    action: 'Xác nhận thời gian khả dụng hằng tuần.',
  },
  UNKNOWN_WORKLOAD: {
    title: 'Khối lượng hiện tại còn dữ liệu chưa xác định',
    impact: 'So sánh nguồn lực chưa bao gồm toàn bộ công việc hiện có.',
    action: 'Rà soát khối lượng của thành viên trước khi giao thêm việc.',
  },
  CAPACITY_OVERLOAD: {
    title: 'Phân bổ vượt quá thời gian khả dụng đã biết',
    impact: 'Công việc hiện tại và kế hoạch mới vượt năng lực hằng tuần đã ghi nhận.',
    action: 'Phân công lại, giảm phạm vi hoặc xác nhận rủi ro.',
  },
  SCHEDULE_UNCERTAIN: {
    title: 'Chưa có hạn hoàn thành chung',
    impact: 'Kế hoạch chỉ thể hiện thứ tự phụ thuộc, chưa thể cam kết ngày hoàn thành.',
    action: 'Xác nhận mốc thời gian thực tế trước khi cam kết.',
  },
};

const countedCodes = new Set([
  'PROVISIONAL_ASSIGNMENT',
  'INVALID_ASSIGNEE',
  'UNASSIGNED_TASKS',
  'MISSING_SKILLS',
  'UNKNOWN_ESTIMATES',
]);

export function readinessIssueCopy(issue: Pick<ReadinessIssue, 'code' | 'affectedTaskIds'>) {
  const fallback = {
    title: 'Kế hoạch cần được rà soát',
    impact: 'Một điều kiện sẵn sàng chưa được đáp ứng.',
    action: 'Làm mới bản xem trước và kiểm tra dữ liệu kế hoạch.',
  };
  const result = copy[issue.code] ?? fallback;
  const count = issue.affectedTaskIds.length;
  if (count === 0 || !countedCodes.has(issue.code)) return result;
  return { ...result, title: `${count} ${result.title.toLocaleLowerCase('vi')}` };
}

export function readinessCodeTitle(code: string) {
  return copy[code]?.title ?? 'Rủi ro đã được xác nhận';
}
