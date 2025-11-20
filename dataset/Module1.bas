Attribute VB_Name = "Module1"
Sub 메뉴입력_최종완성본()
Attribute 메뉴입력_최종완성본.VB_ProcData.VB_Invoke_Func = "k\n14"

    Dim store As String
    Dim menuText As String
    Dim menus As Variant
    Dim ws As Worksheet
    Dim rowCell As Range
    Dim lastCol As Long
    Dim col As Long
    Dim c As Variant
    Dim menuName As Variant

    Dim foundStore As Boolean
    Dim foundAllMenus As Boolean

    ' =======================================
    ' 1. 사업자명 반복 입력
    ' =======================================
    Do
        store = InputBox("사업자명을 입력하세요.")
        
        If store = "" Then
            MsgBox "취소 또는 빈 입력으로 종료합니다."
            Exit Sub
        End If
        
        foundStore = False
        
        ' 모든 시트에서 검색
        For Each ws In ThisWorkbook.Worksheets
            Set rowCell = ws.Columns(1).Find(store, LookIn:=xlValues, LookAt:=xlWhole)
            If Not rowCell Is Nothing Then
                foundStore = True
                Exit For
            End If
        Next ws
        
        If Not foundStore Then
            MsgBox "사업자명을 잘못 입력하셨습니다. 다시 입력하세요."
        End If
    
    Loop Until foundStore = True


    ' =======================================
    ' 2. 메뉴 반복 입력 (1행 메뉴 존재 여부)
    ' =======================================
    Do
        menuText = InputBox("메뉴를 입력하세요. 예: 김치찌개, 된장찌개")
        
        If menuText = "" Then
            MsgBox "취소 또는 빈 입력으로 종료합니다."
            Exit Sub
        End If
        
        menus = Split(Replace(menuText, " ", ""), ",")
        
        foundAllMenus = True
        
        For Each menuName In menus
            
            If menuName <> "" Then
                On Error Resume Next
                c = Application.Match(menuName, ws.Rows(1), 0)
                On Error GoTo 0
                
                ' Error 타입 또는 0이면 존재하지 않는 메뉴
                If IsError(c) Then
                    MsgBox "해당되는 메뉴가 없습니다: " & menuName & vbCrLf & _
                           "다시 입력하세요."
                    foundAllMenus = False
                    Exit For
                End If
                
                If c = 0 Then
                    MsgBox "해당되는 메뉴가 없습니다: " & menuName & vbCrLf & _
                           "다시 입력하세요."
                    foundAllMenus = False
                    Exit For
                End If
            End If
        
        Next menuName

    Loop Until foundAllMenus = True


    ' =======================================
    ' 3. 정상 → 메뉴를 누적해서 1로 입력 (기존 값은 보존)
    ' =======================================
    lastCol = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column

    ' 기존 메뉴를 절대 지우지 않음 (초기화 없음)

    ' 입력 메뉴를 1로 추가
    For Each menuName In menus
        
        If menuName <> "" Then
            On Error Resume Next
            c = Application.Match(menuName, ws.Rows(1), 0)
            On Error GoTo 0
            
            If Not IsError(c) Then
                ws.Cells(rowCell.Row, c).Value = 1    ' 기존 값 있어도 덮어쓰기 OK
            End If
        End If
    
    Next menuName


    MsgBox "입력 완료!" & vbCrLf & _
           "시트: " & ws.Name & vbCrLf & _
           "행 번호: " & rowCell.Row

End Sub


