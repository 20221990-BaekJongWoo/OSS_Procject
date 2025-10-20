1. 기술 스택
   
	백엔드: python ,Flask

	프론트 앤드 : Node.js, Vite, ngrok  (Node.js, ngrok는 따로 설치하셔야 합니다.)
	

ngrok

내 로컬 개발 서버(예: http://localhost:5173, http://127.0.0.1:5000 등)를
외부에서 접근할 수 있도록 임시 공개 주소(도메인)를 만들어줌

내 실제 IP를 노출하지 않고, ngrok 서버가 대리로 요청을 받아서 내 로컬 서버로 전달하는 구조

	사용자 - > ngrok 서버 -> 내 컴퓨터(로컬서버)

즉, 사용자와 로컬 서버 사이에 ngrok이 중개인 역할을 함

ngrok이 자동으로 HTTPS를 적용하므로, 위치 권한이나 브라우저 API 테스트 시에도 편리함





2.작동 방법

작동 테스트용 서버 실행 절차

준비물: Git Bash, CMD

1. 프론트엔드 실행

frontend 폴더에서 Git Bash 키고 npm run dev 를 입력하면 프론트엔드 서버가 열림(기본 포트:5173)


2. ngrok 실행
 
cmd 키고 ngrok http 5173 하면 ngrok이 HTTPS 도메인을 발급해줌 
>>터미널에 표시된 주소로 접속하면 외부에서도 사이트 접속 가능

3. 백엔드 실행 (Flask 서버)

backend 폴더에서 gitbash 키고 python app.py 하면 백엔드 서버가 열림

간혹 모듈이 없다고 안될 때가 있음 

그때에는

python -m venv venv
source venv/Scripts/activate        
python app.py                   

이 순서대로 입력해 주면 됨





3.채워야 할  파일 목록
 
1.index.html 		(frontend)		메인페이지(눈에 보이는 웹사이트)

2.main.js		    (frontend)		웹사이트 로직(fetch 요청 등)

3.app.py  			(backend)		Flask 백엔드 서버

4.csv 데이터셋 파일 	(backend)		음식점 데이터


ex) 대전광역시 서구 음식점 현황.csv
>>데이터셋은 공공데이터 포털 들어가면 얻을 수 있음

>>공공데이터 포털 서버에 화제 나서 공공데이터 포털에서 데이터셋 못구함
>>다른 사이트에서 구해야함



이후에 필요에 따라 추가 될 수도 있음




4. 작동 원리

	1. 프론트엔드와 백엔드는 서로 다른 서버
		>>각자 다른 포트에서 동작하기 때문에 직접 통신 불가

	2. 사용자가 사이트 접속 시
		브라우저가 index.html과 main.js를 받아서 로컬에서 실행함
		초기 로딩 이후에는 프론트엔드 서버와의 직접 통신은 거의 없음


	3. fetch() 같은 함수를 써서  ngrok 서버를 통해  프론트엔드 서버에 요청을 보낼 수 있다


	4. 그럼 사이트에서 백엔드한테 작업 요청은 어떻게 하는가?
		
		프론트엔드의 vite.config.js 파일에서 프록시 설정을 할 수 있음

		main.js를 보면 fetch('/api/recommend', ...  << 이런 부분이 있는데 

		/api/로 시작하게 요청을 보내면 프론트 서버에 요청을 전달하는게 아니라
		프록시 설정에 따라 포트를 바꿔서 백엔드 서버에 요청을 전달하게 됨




