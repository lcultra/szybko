export function App() {
    return (
        <div className="">
            {
                Array.from({ length: 100 }).map((_, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={index} className="border-b border-gray-300 ">
                        <p className="">
                            设置项
                            {index + 1}
                        </p>
                    </div>
                ))
            }
        </div>
    );
}
