const SYNONYM_GROUPS = [
  ["라이다", "lidar", "sllidar", "slamtec", "스캔", "scan"],
  ["카메라", "camera", "영상", "video", "image"],
  ["아루코", "aruco", "마커", "marker"],
  ["모터", "motor", "구동", "주행", "움직이지"],
  ["조향", "steering", "서보", "servo"],
  ["토픽", "topic", "노드", "node", "안 보여", "보이지"],
  ["타임아웃", "timeout", "시간 초과"],
  ["차선", "lane", "차로"],
  ["횡단보도", "crosswalk", "zebra"],
  ["빌드", "build", "colcon", "컴파일"],
  ["시리얼", "serial", "ttyusb", "myserial", "포트"],
  ["사람 추종", "person follow", "person_follow", "인간 추종"],
  ["좌표계", "tf", "transform", "프레임"]
];

const STOP_WORDS = new Set(["이", "가", "을", "를", "은", "는", "에", "에서", "와", "과", "하고", "해", "발생", "문제", "오류", "어떻게", "왜", "안", "돼", "되지", "않아", "있어"]);

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣_/.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function termsFor(query) {
  const normalized = normalize(query);
  const terms = new Set(normalized.split(" ").filter((term) => term.length > 1 && !STOP_WORDS.has(term)));
  for (const group of SYNONYM_GROUPS) {
    if (group.some((term) => normalized.includes(term))) {
      group.forEach((term) => terms.add(normalize(term)));
    }
  }
  return { normalized, terms: [...terms] };
}

function textOf(entry, field) {
  const value = entry[field];
  return normalize(Array.isArray(value) ? value.join(" ") : value);
}

export function searchKnowledge(entries, query, model, options = {}) {
  const context = options.contextTitle ? ` ${options.contextTitle}` : "";
  const isFollowUp = /^(그럼|그러면|그거|이거|다음|그래도|여전히|결과|출력|위|해봤)/.test(normalize(query));
  const effectiveQuery = isFollowUp ? `${query}${context}` : query;
  const { normalized, terms } = termsFor(effectiveQuery);
  if (!normalized || !model) return [];

  return entries
    .filter((entry) => entry.model === model)
    .map((entry) => {
      const fields = {
        title: textOf(entry, "title"),
        symptoms: textOf(entry, "symptoms"),
        keywords: textOf(entry, "keywords"),
        causes: textOf(entry, "causes"),
        environment: textOf(entry, "environment")
      };
      let score = 0;
      for (const term of terms) {
        if (fields.title.includes(term)) score += 7;
        if (fields.symptoms.includes(term)) score += 5;
        if (fields.keywords.includes(term)) score += 4;
        if (fields.causes.includes(term)) score += 2;
        if (fields.environment.includes(term)) score += 1;
      }
      if (entry.keywords.some((keyword) => normalize(query).includes(normalize(keyword)) && normalize(keyword).length >= 5)) score += 10;
      if (isFollowUp && options.contextId === entry.id) score += 8;
      return { entry, score };
    })
    .filter((result) => result.score >= 5)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, "ko"))
    .slice(0, 4);
}

export function makeNoAnswer(model) {
  if (model === "A1") {
    return "현재 A1 경험 기록에서 근거가 충분한 해결 문서를 찾지 못했습니다. 오류 원문과 실행 로그를 입력해 주세요. R2의 Jazzy·SLLIDAR C1·sme_ws2 설정을 대신 제시하지 않습니다.";
  }
  return "현재 지식베이스에서 근거가 충분한 해결 문서를 찾지 못했습니다. 오류 원문, 실행한 명령, 사용 중인 노드/토픽 이름을 함께 입력해 주세요. 확인되지 않은 답을 만들어내지는 않겠습니다.";
}
