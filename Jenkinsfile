#!groovy

pipeline {
  agent none

  options {
    ansiColor('xterm')
    timestamps()
  }

  stages {
    stage('test') {
      agent { label 'ecs-builder-node18' }
      steps {
        sh 'echo Hello'
      }
    }
  }
}
