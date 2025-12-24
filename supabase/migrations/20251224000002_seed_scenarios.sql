-- Critical Events 시나리오 시드 데이터
-- 논문 기반: 갈등 해결, 가치관, 라이프스타일, 미래 계획, 신뢰

-- ============================================
-- 시나리오 1: 갈등 해결 스타일 (Conflict Resolution)
-- ============================================
insert into public.scenarios (title, description, category, display_order) values (
  '의견 충돌 상황',
  '연인과 주말 계획에 대해 의견이 다릅니다. 당신은 집에서 쉬고 싶은데, 상대는 야외 활동을 원합니다. 이런 상황에서 당신은?',
  'conflict',
  1
);

insert into public.scenario_options (scenario_id, option_text, option_code, personality_vector, display_order) values
(1, '상대의 의견을 따릅니다. 관계의 평화가 더 중요하니까요.', 'A', '{"assertiveness": 0.2, "compromise": 0.8, "independence": 0.3}', 1),
(1, '번갈아가며 하자고 제안합니다. 이번 주는 야외, 다음 주는 집에서.', 'B', '{"assertiveness": 0.5, "compromise": 0.9, "independence": 0.5}', 2),
(1, '각자 하고 싶은 것을 하자고 합니다. 꼭 같이 안 해도 괜찮아요.', 'C', '{"assertiveness": 0.6, "compromise": 0.4, "independence": 0.9}', 3),
(1, '왜 야외 활동을 원하는지 대화를 통해 깊이 이해하려 합니다.', 'D', '{"assertiveness": 0.5, "compromise": 0.7, "independence": 0.5}', 4);

-- ============================================
-- 시나리오 2: 커리어 vs 관계 (Values - Career)
-- ============================================
insert into public.scenarios (title, description, category, display_order) values (
  '커리어 기회',
  '꿈에 그리던 해외 취업 기회가 생겼습니다. 하지만 1년간 연인과 떨어져 지내야 합니다. 당신의 선택은?',
  'values',
  2
);

insert into public.scenario_options (scenario_id, option_text, option_code, personality_vector, display_order) values
(2, '커리어를 선택합니다. 이런 기회는 다시 오지 않아요.', 'A', '{"career_priority": 0.9, "relationship_priority": 0.4, "risk_taking": 0.8}', 1),
(2, '연인과 충분히 논의한 후 함께 결정합니다.', 'B', '{"career_priority": 0.6, "relationship_priority": 0.7, "risk_taking": 0.5}', 2),
(2, '관계를 선택합니다. 커리어는 다른 방법으로도 발전시킬 수 있어요.', 'C', '{"career_priority": 0.4, "relationship_priority": 0.9, "risk_taking": 0.3}', 3),
(2, '연인에게 같이 가자고 제안합니다.', 'D', '{"career_priority": 0.7, "relationship_priority": 0.8, "risk_taking": 0.7}', 4);

-- ============================================
-- 시나리오 3: 금전 관리 (Lifestyle - Money)
-- ============================================
insert into public.scenarios (title, description, category, display_order) values (
  '돈 관리 방식',
  '연인과 동거를 시작했습니다. 생활비 관리 방식에 대해 논의 중입니다. 당신이 선호하는 방식은?',
  'lifestyle',
  3
);

insert into public.scenario_options (scenario_id, option_text, option_code, personality_vector, display_order) values
(3, '공동 계좌를 만들어 모든 비용을 함께 관리합니다.', 'A', '{"financial_openness": 0.9, "independence": 0.3, "planning": 0.8}', 1),
(3, '고정 지출만 나누고, 나머지는 각자 관리합니다.', 'B', '{"financial_openness": 0.6, "independence": 0.7, "planning": 0.7}', 2),
(3, '수입 비율에 따라 차등 분담합니다.', 'C', '{"financial_openness": 0.7, "independence": 0.5, "planning": 0.8}', 3),
(3, '완전히 각자 관리하고, 필요할 때만 정산합니다.', 'D', '{"financial_openness": 0.3, "independence": 0.9, "planning": 0.5}', 4);

-- ============================================
-- 시나리오 4: 가족 계획 (Future - Family)
-- ============================================
insert into public.scenarios (title, description, category, display_order) values (
  '미래 가족 계획',
  '진지한 관계로 발전하면서 가족 계획에 대한 이야기가 나왔습니다. 당신의 생각은?',
  'future',
  4
);

insert into public.scenario_options (scenario_id, option_text, option_code, personality_vector, display_order) values
(4, '아이를 꼭 갖고 싶고, 이건 중요한 가치관입니다.', 'A', '{"family_orientation": 0.9, "flexibility": 0.3, "traditional": 0.8}', 1),
(4, '아이가 없어도 괜찮아요. 둘만의 삶도 충분히 행복할 수 있어요.', 'B', '{"family_orientation": 0.3, "flexibility": 0.7, "traditional": 0.3}', 2),
(4, '상대방의 의견에 따라 유연하게 결정할 수 있어요.', 'C', '{"family_orientation": 0.5, "flexibility": 0.9, "traditional": 0.5}', 3),
(4, '아직 생각해본 적 없어요. 더 시간이 필요해요.', 'D', '{"family_orientation": 0.5, "flexibility": 0.6, "traditional": 0.4}', 4);

-- ============================================
-- 시나리오 5: 신뢰와 프라이버시 (Trust)
-- ============================================
insert into public.scenarios (title, description, category, display_order) values (
  '신뢰와 프라이버시',
  '연인이 당신의 휴대폰을 잠깐 봐도 되냐고 물어봅니다. 당신의 반응은?',
  'trust',
  5
);

insert into public.scenario_options (scenario_id, option_text, option_code, personality_vector, display_order) values
(5, '당연히 보여줍니다. 숨길 게 없으니까요.', 'A', '{"openness": 0.9, "privacy_need": 0.2, "trust_style": 0.8}', 1),
(5, '보여주지만, 왜 보고 싶은지 이유를 물어봅니다.', 'B', '{"openness": 0.6, "privacy_need": 0.5, "trust_style": 0.6}', 2),
(5, '보여주기 불편해요. 개인 공간은 존중받아야 한다고 생각해요.', 'C', '{"openness": 0.3, "privacy_need": 0.9, "trust_style": 0.4}', 3),
(5, '서로의 휴대폰을 확인하는 관계는 건강하지 않다고 솔직히 말합니다.', 'D', '{"openness": 0.4, "privacy_need": 0.8, "trust_style": 0.5}', 4);
