const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const pmPath = path.join(rootDir, 'app', 'src', 'components', 'ProductModal.tsx');

if (fs.existsSync(pmPath)) {
  let content = fs.readFileSync(pmPath, 'utf8').replace(/\r\n/g, '\n');

  // 1. 탭 네비게이션 헤더 변경
  content = content.replace(
    /\{\s*id:\s*1,\s*label:\s*'📑 1\. 기본 정보'\s*\},\s*\{\s*id:\s*2,\s*label:\s*'🏭 2\. 공급 유통망'\s*\},\s*\{\s*id:\s*3,\s*label:\s*'💰 3\. 가격\(단가\) 관리'\s*\},\s*\{\s*id:\s*4,\s*label:\s*'📦 4\. 패킹 정보'\s*\},\s*\{\s*id:\s*6,\s*label:\s*'🔬 5\. 기술 자료'\s*\}/g,
    `{ id: 1, label: '📋 1. 상품 스펙 및 패킹/기술자료' },\n                { id: 2, label: '💰 2. 공급 유통사 및 단가 이력' }`
  );

  // 2. activeTab === 4 및 activeTab === 6 블록(패킹 및 파일)의 컨텐츠 추출하여 activeTab === 1 마지막에 병합
  // 패킹 정보 블록과 기술 자료 블록의 소스 코드 찾기
  // {activeTab === 4 && ( ... )} 과 {activeTab === 6 && ( ... )}을 추출하고 이들을 지운다.
  const tab4Match = content.match(/\{\/\* ─── 포장 및 팰릿 스펙 관리 ─── \*\/\}([\s\S]*?)(?=\{\/\*|$)/);
  const tab6Match = content.match(/\{\/\* ─── 기술 자료 첨부파일 관리 ─── \*\/\}([\s\S]*?)(?=\{\/\*|$)/);
  
  let tab4Content = '';
  let tab6Content = '';

  if (tab4Match) {
    tab4Content = tab4Match[0];
    // 기존 {activeTab === 4 && ( ... )} 블록 제거
    content = content.replace(/\{activeTab === 4 && \([\s\S]*?\)\}/g, '');
  }
  if (tab6Match) {
    tab6Content = tab6Match[0];
    // 기존 {activeTab === 6 && ( ... )} 블록 제거
    content = content.replace(/\{activeTab === 6 && \([\s\S]*?\)\}/g, '');
  }

  // 3. activeTab === 3 (가격 관리) 컨텐츠 추출하여 activeTab === 2 마지막에 병합
  const tab3Match = content.match(/\{\/\* ── 현재 구매가\(원가\) 고정 영역 ── \*\/\}([\s\S]*?)(?=\{\/\*|$)/);
  let tab3Content = '';
  if (tab3Match) {
    tab3Content = tab3Match[0];
    // 기존 {activeTab === 3 && ( ... )} 블록 제거
    content = content.replace(/\{activeTab === 3 && \([\s\S]*?\)\}/g, '');
  }

  // 4. Tab 1 블록의 닫히는 지점 직전에 패킹 정보와 기술 자료 내용 주입
  // activeTab === 1의 닫힘은 `</>\n            )}` 형태입니다.
  const tab1EndIndicator = `                    </div>\n                  );\n                })()}\n              </>\n            )}`;
  
  if (content.includes(tab1EndIndicator)) {
    const replacement = `                    </div>\n                  );\n                })()}\n                \n                {/* ─── 패킹 정보 및 기술 자료 통합 ─── */}\n                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>\n                  ${tab4Content}\n                  ${tab6Content}\n                </div>\n              </>\n            )}`;
    content = content.replace(tab1EndIndicator, replacement);
  }

  // 5. Tab 2 블록의 닫히는 지점 직전에 가격 정보 내용 주입
  const tab2EndIndicator = `                                </table>\n                              </div>\n                            )}\n                          </td>\n                        </tr>\n                      </tbody>\n                    </table>\n                  </div>\n                </div>\n              </>\n            )}`;

  if (content.includes(tab2EndIndicator)) {
    const replacement = `                                </table>\n                              </div>\n                            )}\n                          </td>\n                        </tr>\n                      </tbody>\n                    </table>\n                  </div>\n                </div>\n                \n                {/* ─── 단가 히스토리 관리 통합 ─── */}\n                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>\n                  ${tab3Content}\n                </div>\n              </>\n            )}`;
    content = content.replace(tab2EndIndicator, replacement);
  }

  // 6. 혹시 activeTab === 3, 4, 6의 탭 전환 방어 코드나 기타 참조가 있는지도 체크
  // e.g. setActiveTab(tabId) 시 유효하지 않은 탭 번호가 세팅되는 것 방지
  fs.writeFileSync(pmPath, content, 'utf8');
  console.log('✅ ProductModal.tsx consolidated into 2 tabs successfully.');
} else {
  console.log('❌ ProductModal.tsx not found');
}
