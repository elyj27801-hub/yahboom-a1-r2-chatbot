# 공통 문제 해결 절차

[README로 돌아가기](../README.md) · [A1 기록](A1.md) · [R2 기록](R2.md)

이 문서는 챗봇에 수록된 사례를 공통 진단 순서로 정리합니다. 명령은 자동 실행되지 않으며, 선택한 로봇과 ROS 2 배포판을 먼저 확인해야 합니다.

## 안전 우선순위

1. 모터·조향 이상이면 차량을 정지하고 바퀴를 지면에서 분리합니다.
2. 비상 정지 수단과 충분한 시험 공간을 확보합니다.
3. 장치 번호, 전원, 케이블과 점유 상태를 읽기 전용 명령으로 확인합니다.
4. 원인 확인 전 드라이버 재설치, udev 변경, 권한 완화, PWM/디바이스 트리 변경을 하지 않습니다.
5. A1과 R2의 작업공간·ROS 배포판·센서 드라이버를 섞지 않습니다.

## 1. 환경 식별

### A1 — ROS 2 Humble

```bash
source /opt/ros/humble/setup.bash
source ~/yahboomcar_ros2_ws/software/library_ws/install/setup.bash
source ~/yahboomcar_ros2_ws/yahboomcar_ws/install/setup.bash
printenv ROS_DISTRO
ros2 pkg executables yahboomcar_bringup
```

### R2 — ROS 2 Jazzy

```bash
source /opt/ros/jazzy/setup.bash
source ~/sme_ws2/install/setup.bash
printenv ROS_DISTRO
ros2 pkg list | grep -E "sme_node|r2_aruco|r2_active_vision"
```

R2 프로젝트의 `ROS_DOMAIN_ID=6` 기록은 모든 장비의 고정값이 아닙니다. 통신할 터미널과 노드가 같은 값을 사용하는지 확인합니다.

## 2. ROS 그래프 확인

```bash
ros2 node list
ros2 topic list -t
ros2 topic info -v /cmd_vel
```

- 패키지가 보이지 않으면 올바른 workspace setup을 source했는지 확인합니다.
- 토픽 발행자와 구독자가 연결됐는지 `topic info -v`로 확인합니다.
- 목록은 보이지만 데이터가 없으면 `topic hz`, `topic echo --once`로 발행 상태를 구분합니다.
- 로그가 없으면 오류를 단정하지 말고 첫 번째 실패 메시지를 확보합니다.

## 3. USB·시리얼 장치 확인

```bash
lsusb
ls -l /dev/serial/by-id/
ls -l /dev/ttyUSB* 2>/dev/null
readlink -f /dev/myserial
```

장치를 하나씩 분리 연결해 vendor/model/serial과 실제 기능을 대응시킵니다. 포트 점유는 장비와 명령을 확인한 뒤 조사하며, 프로세스 강제 종료를 기본 해결책으로 사용하지 않습니다.

## 4. 센서 데이터 확인

| 대상 | 확인 명령 | 다음 판단 |
|---|---|---|
| LiDAR | `ros2 topic hz /scan` | 주기가 없으면 드라이버·포트, 있으면 `frame_id`·TF·RViz 확인 |
| 카메라 | `ros2 topic hz /camera/image_raw` | 장치/포맷과 ROS 발행 문제 분리 |
| 보정 영상 | `ros2 topic hz /image_rect` | CameraInfo·해상도와 같은 파이프라인인지 확인 |
| IMU | `ros2 topic echo /imu/data_raw --once` | 시리얼 통신과 개별 센서 값을 분리 판단 |
| odom | `ros2 topic hz /odom` | TF와 시간 갱신을 함께 확인 |

A1 HP60C는 `/dev/video0`만 찾지 말고 `ascamera` SDK와 실제 이미지 토픽을 확인합니다. R2 USB Camera는 V4L2 캡처 노드와 OpenCV 설정을 확인합니다.

## 5. TF와 좌표계 확인

```bash
ros2 run tf2_ros tf2_echo odom base_link
ros2 run tf2_ros tf2_echo base_link laser
ros2 run tf2_tools view_frames
```

TF가 없거나 시간이 갱신되지 않으면 SLAM·Nav2 파라미터 튜닝 전에 프레임 이름, 메시지 `header.frame_id`, timestamp와 발행 노드를 확인합니다.

## 6. 모터와 조향

```bash
ros2 topic info -v /cmd_vel
ros2 topic echo /cmd_vel --once
```

- 명령이 없으면 상위 제어 노드를 확인합니다.
- 명령은 있지만 움직이지 않으면 motor node, MCU 시리얼, 전원·비상 정지를 확인합니다.
- 한쪽 모터만 동작하면 보정값으로 숨기지 말고 배선·모터·출력 채널·기계적 걸림을 분리합니다.
- R2의 `/cmd_vel_raw`는 안전 중계 구조를 우회하지 않습니다.
- Ackermann 차량에서 정지와 조향 중앙 복귀, 선속도와 조향 명령을 별도 요구사항으로 확인합니다.

## 7. SLAM과 Nav2

1. `/scan`과 `/odom`이 지속 발행되는지 확인합니다.
2. `odom → base_link → laser` TF를 확인합니다.
3. SLAM/localization의 `map → odom`을 확인합니다.
4. Nav2가 사용하는 scan 토픽과 필터 발행자를 확인합니다.
5. lifecycle 상태와 첫 오류 로그를 확인합니다.
6. Ackermann 제약과 불가능한 제자리 회전 명령을 확인합니다.

```bash
ros2 lifecycle nodes
ros2 topic hz /scan_filtered
```

## 8. 비전·차선·ArUco

- 원본 이미지 → 보정 이미지 → 인식 결과 → 제어 명령 순서로 토픽을 확인합니다.
- 카메라 해상도와 calibration YAML을 비교합니다.
- 차선 debug 영상에서 mask, BEV, 목표 경로와 confidence를 확인합니다.
- ArUco는 dictionary, ID, 물리 크기, `/image_rect`, `/camera_info_rect`를 확인합니다.
- Pan/Tilt 명령 발행과 servo node 수신을 분리합니다.

## 결과 기록 템플릿

새 사례는 다음 정보를 함께 기록하면 진단 품질이 높아집니다.

```text
모델: A1 또는 R2
OS / ROS 2:
증상과 오류 원문:
실행한 노드·launch:
관련 토픽과 타입:
장치 식별 결과:
실행한 확인 명령과 출력 요약:
변경한 내용:
정상 동작 검증:
검증 상태: 확인됨 / 부분 확인 / 미해결
출처:
```

지식베이스 반영 절차는 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.
