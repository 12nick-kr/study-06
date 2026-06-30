const { chromium } = require('playwright');
const path = require('path');

const FILE_URL = 'file:///' + path.resolve(__dirname, 'shopping-list.html').replace(/\\/g, '/');

let passed = 0;
let failed = 0;

async function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

async function runTests() {
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const context = await browser.newContext();
  const page = await context.newPage();

  // localStorage 초기화를 위해 빈 페이지를 먼저 열어 두기
  await page.goto(FILE_URL);
  await page.evaluate(() => localStorage.removeItem('shopping-items'));
  await page.reload();

  console.log('\n══════════════════════════════════════');
  console.log('  쇼핑 리스트 앱 자동 테스트 시작');
  console.log('══════════════════════════════════════\n');

  // ── 1. 초기 상태 ─────────────────────────────
  console.log('📋 [1] 초기 상태 확인');
  const emptyVisible = await page.isVisible('#empty');
  await assert('빈 상태 메시지가 표시됨', emptyVisible);

  const listCount = await page.locator('#list li').count();
  await assert('리스트가 비어 있음', listCount === 0);

  // ── 2. 아이템 추가 ───────────────────────────
  console.log('\n➕ [2] 아이템 추가');

  // 버튼 클릭으로 추가
  await page.fill('#itemInput', '사과');
  await page.click('button:has-text("추가")');
  const count1 = await page.locator('#list li').count();
  await assert('"사과" 추가 후 리스트에 1개 항목', count1 === 1);

  const text1 = await page.locator('.item-text').first().textContent();
  await assert('"사과" 텍스트가 올바르게 표시됨', text1?.trim() === '사과');

  // Enter 키로 추가
  await page.fill('#itemInput', '우유');
  await page.press('#itemInput', 'Enter');
  const count2 = await page.locator('#list li').count();
  await assert('Enter 키로 "우유" 추가 후 2개 항목', count2 === 2);

  // 세 번째 아이템
  await page.fill('#itemInput', '달걀');
  await page.press('#itemInput', 'Enter');
  const count3 = await page.locator('#list li').count();
  await assert('"달걀" 추가 후 3개 항목', count3 === 3);

  // 빈 입력 추가 시도 (무시되어야 함)
  await page.fill('#itemInput', '   ');
  await page.press('#itemInput', 'Enter');
  const count4 = await page.locator('#list li').count();
  await assert('공백 입력은 추가되지 않음', count4 === 3);

  // 빈 상태 메시지 숨김 확인
  const emptyHidden = await page.isHidden('#empty');
  await assert('아이템 추가 후 빈 상태 메시지 숨김', emptyHidden);

  // 통계 확인
  const statsText = await page.locator('#stats').textContent();
  await assert('통계에 "총 3개" 표시', statsText?.includes('3'));

  // ── 3. 체크 기능 ─────────────────────────────
  console.log('\n☑️  [3] 체크(완료) 기능');

  // 첫 번째 아이템(사과) 체크
  await page.locator('.check-btn').first().click();
  const isChecked = await page.locator('#list li').first().evaluate(el => el.classList.contains('checked'));
  await assert('"사과" 체크 후 checked 클래스 추가됨', isChecked);

  const strikeThrough = await page.locator('#list li').first().locator('.item-text').evaluate(el => {
    const style = window.getComputedStyle(el);
    return style.textDecoration.includes('line-through');
  });
  await assert('체크된 아이템에 취소선 스타일 적용됨', strikeThrough);

  // 통계에 완료 1개 표시
  const statsAfterCheck = await page.locator('#stats').textContent();
  await assert('통계에 "완료 1개" 표시', statsAfterCheck?.includes('완료') && statsAfterCheck?.includes('1'));

  // 체크 토글 (다시 클릭해서 해제)
  await page.locator('.check-btn').first().click();
  const isUnchecked = await page.locator('#list li').first().evaluate(el => !el.classList.contains('checked'));
  await assert('다시 클릭 시 체크 해제됨', isUnchecked);

  // 재체크
  await page.locator('.check-btn').first().click();

  // ── 4. 아이템 삭제 ───────────────────────────
  console.log('\n🗑️  [4] 아이템 삭제');

  // 두 번째 아이템(우유) 삭제
  const beforeDelete = await page.locator('#list li').count();
  await page.locator('.delete-btn').nth(1).click();
  const afterDelete = await page.locator('#list li').count();
  await assert('삭제 후 아이템이 1개 줄었음', afterDelete === beforeDelete - 1);

  // 남은 텍스트 확인 (사과, 달걀 남아야 함)
  const remainingTexts = await page.locator('.item-text').allTextContents();
  await assert('"우유"가 목록에서 사라짐', !remainingTexts.includes('우유'));
  await assert('"사과"와 "달걀"은 유지됨', remainingTexts.includes('사과') && remainingTexts.includes('달걀'));

  // ── 5. 완료 항목 일괄 삭제 ───────────────────
  console.log('\n🧹 [5] 완료 항목 일괄 삭제');

  // 현재 사과가 체크된 상태 (달걀은 미체크)
  await page.locator('button:has-text("완료 항목 삭제")').click();
  const afterClear = await page.locator('#list li').count();
  await assert('완료 항목 삭제 후 체크된 항목 제거됨', afterClear === 1);

  const remainingAfterClear = await page.locator('.item-text').allTextContents();
  await assert('"달걀"(미체크)은 유지됨', remainingAfterClear.includes('달걀'));
  await assert('"사과"(체크)는 제거됨', !remainingAfterClear.includes('사과'));

  // ── 6. localStorage 유지 확인 ───────────────
  console.log('\n💾 [6] localStorage 데이터 유지');

  await page.fill('#itemInput', '버터');
  await page.press('#itemInput', 'Enter');

  await page.reload();
  const afterReload = await page.locator('#list li').count();
  await assert('페이지 새로고침 후에도 데이터 유지 (2개)', afterReload === 2);

  const textsAfterReload = await page.locator('.item-text').allTextContents();
  await assert('새로고침 후 "달걀" 유지됨', textsAfterReload.includes('달걀'));
  await assert('새로고침 후 "버터" 유지됨', textsAfterReload.includes('버터'));

  // ── 7. 마지막 항목 삭제 시 빈 상태 복귀 ────
  console.log('\n🔄 [7] 모든 항목 삭제 시 빈 상태 복귀');

  const allDeleteBtns = await page.locator('.delete-btn').all();
  for (const btn of allDeleteBtns.reverse()) {
    await btn.click();
  }
  const emptyAgain = await page.isVisible('#empty');
  await assert('모든 항목 삭제 후 빈 상태 메시지 다시 표시됨', emptyAgain);

  // ── 결과 요약 ─────────────────────────────
  console.log('\n══════════════════════════════════════');
  console.log(`  테스트 완료: ✅ ${passed}개 통과 / ❌ ${failed}개 실패`);
  console.log('══════════════════════════════════════\n');

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('테스트 실행 오류:', err);
  process.exit(1);
});
