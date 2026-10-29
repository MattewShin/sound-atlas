# KOPIS 공연 탐색 서버 설정

공연 찾기는 서버 전용 KOPIS_SERVICE_KEY와 GET 전용 프록시를 사용한다. 키를 VITE_ 환경변수에 넣거나 브라우저 코드에 전달하지 않는다. .env.example을 참고하고 실제 .env는 Git에서 제외한다.

개발: npm install 후 npm run dev. Node 운영: npm run build 후 npm start. Vite/Node/Vercel은 server/concertSearchService.mjs의 동일 KOPIS 경로를 사용한다. Vercel 프로젝트에도 KOPIS_SERVICE_KEY를 서버 환경변수로 설정한다. CONCERT_CACHE_TTL_MS는 기본21600000(6시간)이다.

GET /api/concerts/status에서 configured/genre/pageSize를 확인하고 GET /api/concerts에 region/from/to/page/q를 전달한다. 상세는 GET /api/concerts/PF번호다. 키·연결정보·upstream URL/본문을 로그에 출력하지 않는다. 실제 호출 검증은 GET만 수행하며 테스트용 DB 쓰기를 하지 않는다.

기존 OCR·Program 분석·곡 매칭·Supabase 검색 설정과 실행 명령은 종료했다. 과거 DB와 migration은 보존한다. 새 기능 배포 확인 후 기존 ClassicAtlas-LocalPipeline 예약을 Disabled하며 대체 배치를 두지 않는다. [현재 설계](CONCERT_BROWSER.md), 실제 전환 결과는 [HANDOFF](../HANDOFF.md)를 참조한다.
