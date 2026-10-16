Note: I will relax the line limit style-debt hook prior to this port.  Just tell me where to look to set the limit first. 

Here is the work to do, written as steps, and each step has pseudo-code of how to spawn agents and what agent type to spawn.  effort should be high for every spawned subagent

- library code only: one agent creates empty typescript functions with the same name as the python names.
```
createFile('funcNames.txt')
for( file in [tmux_lib, tmux_lib_internal]):
    createFile(`file`.ts)
    agent(.model="haiku", 
          .prompt="
        read `file`.py and collect the function names as 'funcNames'.
        for( func in funcNames )  
            argList = getArgList(func).
            write an empty function `func` with `argList` into `file`.ts.
            write `func, file` into funcNames.txt on a new line."
```
after empty typescript functions are created:
- library code only: spawn one subagent per function: read the python code for that function, port it to typescript. be sure to specify types everywhere, so there are no untyped variables
```
funcNames = readLines(funcNames.txt, '\n')
for( [func,file] in funcNames )
   agent(.model="haiku", .prompt="port `func` from `file`.py to typescript. write the ported function to `file`.ts, as the body of `func`. be sure to specify types everywhere, so there are no untyped variables")
```
After library code is ported:
- create test scaffold source files with same names as python test files
```
fileNames = getFileNames('tests/')
for( file in fileNames )
    os.touch("tests/${file}.ts");
```
after finishing making test files:
- have an agent get all function names from the test files, per file
```
agent("create testFuncNames.txt. 
    for(file in fileNames)
        funcNames = getAllFuncNames(`file`)
        for( func in funcNames )
            writeLine(to:testFuncNames.txt, line:'${func}, ${file}')
```
after testFuncNames.txt is populated:
- spawn one subagent per file to create empty typescript test functions with the same names as the python names. 
```
funcNamesPerFile = readLines(testFuncNames.txt, '\n')
currentFile = null
currentAgent = null
for( [func, file] in funcNamesPerFile )
    if currentFile != file 
        currentAgent = agent(.model=sonnet)
    currentAgent.message("read the `func` signature from `file`.py. create `func` in `file`.ts with the same signature. ")
```
after empty typescript test functions are created:
- spawn one subagent per test function: read the python code for that function, port it to typescript. be sure to specify types everywhere, so there are no untyped variables
```
for( [func, file] in funcNamesPerFile )
    agent(.model="haiku", .prompt="port `func` from `file`.py to typescript. write the ported function to `file`.ts, as the body of `func`. be sure to specify types everywhere, so there are no untyped variables")
```
after test functions are ported:
- Loop: run the full suite until it passes. if any individual tests fail, spawn a single subagent to fix the code used by that test to get that test running. 
```
while( true )
    failures = command(npm run test)
    if failures.size() == 0 
        break;
    for( failure in failures )
        agent(.model="sonnet", .prompt="fix the code being tested by `failure.test`. keep fixing until `failure.test` passes" )
```