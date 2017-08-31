# LeMans: Virtual actor framework for [node](http://nodejs.org) 

LeMans is a framework to writing distributed systems using virtual actors in JavaScript. 
It allows developers to write scalable applications while simplifying concurrency, state management and actor lifetime.

LeMans was inspired by the fine work of [Microsoft Research](https://www.microsoft.com/en-us/research/project/orleans-virtual-actors/) on 
[Orleans](http://dotnet.github.io/orleans/index.html) for the.NET framework.  LeMans shares many of the same concepts and syntax as Orleans, but has a much different implementation
due to the single-threaded nature of node and the use of isolated worker processes.

